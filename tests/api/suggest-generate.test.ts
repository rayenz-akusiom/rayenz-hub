import { describe, expect, it } from 'vitest';
import { handleSuggestGenerate } from '../../packages/api/src/handlers/suggest-generate.ts';
import { handleSuggestReleases } from '../../packages/api/src/handlers/suggest-releases.ts';
import { handleSetPool } from '../../packages/api/src/handlers/set-pools.ts';
import { handleDeck } from '../../packages/api/src/handlers/decks.ts';
import { handleProfile } from '../../packages/api/src/handlers/profiles.ts';
import { createMemoryStores, TEST_AUTH_HEADERS } from './helpers/test-services.ts';
import commander from '../fixtures/deck-builder/commander-slice.json';

function cloneDeck(deckId: string, name: string) {
  return {
    ...commander,
    deckId,
    name,
    updatedAt: '2026-07-16T00:00:00.000Z',
    createdAt: '2026-07-16T00:00:00.000Z',
  };
}

async function seedPool(services: ReturnType<typeof createMemoryStores>['services']) {
  await handleSetPool(
    'PUT',
    'MSH',
    TEST_AUTH_HEADERS,
    JSON.stringify({
      codes: ['MSH'],
      complete: true,
      cards: [
        {
          name: 'Take Up the Shield',
          set_code: 'MSH',
          collector_number: '39',
          type_line: 'Instant',
          oracle_text: 'indestructible',
          keywords: [],
        },
      ],
    }),
    services,
  );
}

const sampleCard = {
  name: 'Take Up the Shield',
  set_code: 'MSH',
  collector_number: '39',
  scryfall_id: 'id-1',
  scryfall_uri: null,
  oracle_id: 'oracle-1',
  mana_cost: '',
  cmc: 2,
  type_line: 'Instant',
  oracle_text: 'indestructible',
  colors: [],
  color_identity: [],
  keywords: [],
  legalities: {},
  produced_mana: [],
  power: null,
  toughness: null,
  rarity: null,
};

describe('GET /v1/suggest/releases', () => {
  it('returns 401 without API key', async () => {
    const { services } = createMemoryStores();
    const res = await handleSuggestReleases({}, services);
    expect(res.statusCode).toBe(401);
  });

  it('returns bundled group/block catalog', async () => {
    const { services } = createMemoryStores();
    const res = await handleSuggestReleases(TEST_AUTH_HEADERS, services);
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(String(res.body));
    expect(body.formatVersion).toBe(1);
    expect(body.releases.length).toBeGreaterThan(50);
    expect(body.releases.some((r: { kind: string }) => r.kind === 'group')).toBe(true);
    expect(body.releases.some((r: { kind: string }) => r.kind === 'block')).toBe(true);
  });
});

describe('POST /v1/suggest/generate', () => {
  it('returns 401 without API key', async () => {
    const { services } = createMemoryStores();
    const res = await handleSuggestGenerate(
      {},
      JSON.stringify({ setCodes: ['MSH'], deckIds: ['cmd-fixture'] }),
      services,
    );
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(String(res.body)).code).toBe('UNAUTHORIZED');
  });

  it('returns 400 PAGE_TOO_LARGE when deckIds exceed cap', async () => {
    const { services } = createMemoryStores();
    const prev = process.env.HUB_SUGGEST_DECK_CAP;
    process.env.HUB_SUGGEST_DECK_CAP = '2';
    try {
      const res = await handleSuggestGenerate(
        TEST_AUTH_HEADERS,
        JSON.stringify({ setCodes: ['MSH'], deckIds: ['a', 'b', 'c'] }),
        services,
      );
      expect(res.statusCode).toBe(400);
      const body = JSON.parse(String(res.body));
      expect(body.code).toBe('PAGE_TOO_LARGE');
      expect(body.cap).toBe(2);
      expect(body.requested).toBe(3);
    } finally {
      if (prev == null) delete process.env.HUB_SUGGEST_DECK_CAP;
      else process.env.HUB_SUGGEST_DECK_CAP = prev;
    }
  });

  it('returns 400 when more than 5 manual set codes are sent', async () => {
    const { services } = createMemoryStores();
    const res = await handleSuggestGenerate(
      TEST_AUTH_HEADERS,
      JSON.stringify({
        setCodes: ['A', 'B', 'C', 'D', 'E', 'F'],
        deckIds: ['cmd-fixture'],
      }),
      services,
    );
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when both setCodes and release are sent', async () => {
    const { services } = createMemoryStores();
    const res = await handleSuggestGenerate(
      TEST_AUTH_HEADERS,
      JSON.stringify({
        setCodes: ['MSH'],
        release: { kind: 'group', code: 'MSH' },
        deckIds: ['cmd-fixture'],
      }),
      services,
    );
    expect(res.statusCode).toBe(400);
  });

  it('ensures missing set pool via fetchSetCards dep', async () => {
    const { services } = createMemoryStores();
    await handleDeck('PUT', 'cmd-fixture', TEST_AUTH_HEADERS, JSON.stringify(commander), services);
    const res = await handleSuggestGenerate(
      TEST_AUTH_HEADERS,
      JSON.stringify({ setCodes: ['MSH'], deckIds: ['cmd-fixture'] }),
      services,
      {
        fetchSetCards: async () => ({
          product_name: 'Marvel Super Heroes',
          primary_set_code: 'MSH',
          set_codes: ['MSH'],
          sets: [],
          expected_card_count: 1,
          fetched_card_count: 1,
          cards: [sampleCard],
        }),
      },
    );
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(String(res.body));
    expect(body.setCodes).toEqual(['MSH']);
    expect(body.setCodesKey).toBe('MSH');
  });

  it('resolves Scryfall group release then generates', async () => {
    const { services } = createMemoryStores();
    await handleDeck('PUT', 'cmd-fixture', TEST_AUTH_HEADERS, JSON.stringify(commander), services);
    const res = await handleSuggestGenerate(
      TEST_AUTH_HEADERS,
      JSON.stringify({
        release: { kind: 'group', code: 'LTR' },
        deckIds: ['cmd-fixture'],
      }),
      services,
      {
        fetchReleaseCards: async (kind, code) => ({
          product_name: 'The Lord of the Rings',
          primary_set_code: code.toUpperCase(),
          set_codes: ['LTR', 'LTC', 'TLTR', 'ALTR', 'PLTR', 'MLTR'],
          sets: [],
          expected_card_count: 1,
          fetched_card_count: 1,
          cards: [{ ...sampleCard, set_code: 'LTR' }],
        }),
      },
    );
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(String(res.body));
    expect(body.release).toEqual({ kind: 'group', code: 'LTR' });
    expect(body.setCodes.length).toBeGreaterThan(5);
    expect(body.setCodes).toContain('LTR');
  });

  it('returns 200 grouped results with audit; missing deck is skipped', async () => {
    const { services } = createMemoryStores();
    await seedPool(services);
    await handleDeck('PUT', 'cmd-fixture', TEST_AUTH_HEADERS, JSON.stringify(commander), services);
    await handleProfile(
      'PUT',
      'cmd-fixture',
      TEST_AUTH_HEADERS,
      JSON.stringify({
        yaml: 'deck_id: cmd-fixture\nformat: commander\nroles:\n  - id: protection\n    priority: high\n    tags: [protection, indestructible]\n',
      }),
      services,
    );

    const res = await handleSuggestGenerate(
      TEST_AUTH_HEADERS,
      JSON.stringify({ setCodes: ['MSH'], deckIds: ['cmd-fixture', 'missing-deck'] }),
      services,
    );
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(String(res.body));
    expect(body.cap).toBe(20);
    expect(body.setCodesKey).toBe('MSH');
    expect(body.setCodes).toEqual(['MSH']);
    expect(body.deckResults).toHaveLength(2);
    expect(body.deckResults[0].deckId).toBe('cmd-fixture');
    expect(body.deckResults[0].skipped).toBe(false);
    expect(Array.isArray(body.deckResults[0].audit)).toBe(true);
    expect(body.deckResults[0].audit.length).toBeGreaterThan(0);
    expect(body.deckResults[1].skipReason).toBe('not_found');
  });

  it('processes many deckIds in one POST', async () => {
    const { services } = createMemoryStores();
    await seedPool(services);
    const ids: string[] = [];
    for (let i = 0; i < 5; i += 1) {
      const id = `cmd-${i}`;
      ids.push(id);
      await handleDeck(
        'PUT',
        id,
        TEST_AUTH_HEADERS,
        JSON.stringify(cloneDeck(id, `Deck ${i}`)),
        services,
      );
    }
    const res = await handleSuggestGenerate(
      TEST_AUTH_HEADERS,
      JSON.stringify({ setCodes: ['MSH'], deckIds: ids }),
      services,
    );
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(String(res.body));
    expect(body.deckResults).toHaveLength(5);
    expect(body.deckResults.map((r: { deckId: string }) => r.deckId)).toEqual(ids);
  });
});
