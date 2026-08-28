import { describe, expect, it } from 'vitest';
import { handleSuggestGenerate } from '../../packages/api/src/handlers/suggest-generate.ts';
import { handleDeck } from '../../packages/api/src/handlers/decks.ts';
import { handleProfile } from '../../packages/api/src/handlers/profiles.ts';
import { createMemoryStores, TEST_AUTH_HEADERS } from './helpers/test-services.ts';
import commander from '../fixtures/deck-builder/commander-slice.json';

const upgradeCard = {
  name: 'Feed the Swarm',
  set_code: 'CMR',
  collector_number: '1',
  type_line: 'Instant',
  oracle_text: 'destroy target creature',
  keywords: [],
  oracle_tags: ['removal'],
  usd: 3.5,
};

describe('POST /v1/suggest/generate budget mode', () => {
  it('returns 400 when multiple deckIds sent', async () => {
    const { services } = createMemoryStores();
    const res = await handleSuggestGenerate(
      TEST_AUTH_HEADERS,
      JSON.stringify({ budgetUsd: 25, deckIds: ['a', 'b'] }),
      services,
    );
    expect(res.statusCode).toBe(400);
  });

  it('returns 409 UPGRADE_POOL_EMPTY when pool build yields no cards', async () => {
    const { services } = createMemoryStores();
    await handleDeck('PUT', 'cmd-fixture', TEST_AUTH_HEADERS, JSON.stringify(commander), services);
    const res = await handleSuggestGenerate(
      TEST_AUTH_HEADERS,
      JSON.stringify({ budgetUsd: 25, deckIds: ['cmd-fixture'] }),
      services,
      {
        buildUpgradePool: async () => ({
          cards: [],
          codesKey: 'upgrade:cmd-fixture:25',
          codes: ['upgrade:cmd-fixture:25'],
          primaryCode: 'UPGRADE',
          cardCount: 0,
        }),
      },
    );
    expect(res.statusCode).toBe(409);
    expect(JSON.parse(String(res.body)).code).toBe('UPGRADE_POOL_EMPTY');
  });

  it('returns budget mode response with packages', async () => {
    const { services } = createMemoryStores();
    await handleDeck('PUT', 'cmd-fixture', TEST_AUTH_HEADERS, JSON.stringify(commander), services);
    await handleProfile(
      'PUT',
      'cmd-fixture',
      TEST_AUTH_HEADERS,
      JSON.stringify({
        yaml: 'deck_id: cmd-fixture\nformat: commander\nroles:\n  - id: removal\n    tags: [removal]\n',
      }),
      services,
    );

    const res = await handleSuggestGenerate(
      TEST_AUTH_HEADERS,
      JSON.stringify({
        budgetUsd: 25,
        deckIds: ['cmd-fixture'],
      }),
      services,
      {
        buildUpgradePool: async () => ({
          cards: [upgradeCard],
          codesKey: 'upgrade:cmd-fixture:25',
          codes: ['upgrade:cmd-fixture:25'],
          primaryCode: 'UPGRADE',
          cardCount: 1,
        }),
      },
    );
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(String(res.body));
    expect(body.mode).toBe('budget');
    expect(body.upgradePoolKey).toContain('upgrade:cmd-fixture:25');
    expect(body.deckResults[0].packages).toBeDefined();
    expect(body.deckResults[0].packaging?.poolCardCount).toBe(1);
    expect(body.deckResults[0].packaging?.budgetUsd).toBe(25);
  });

  it('echoes focusTags and records pool card count in packaging audit', async () => {
    const { services } = createMemoryStores();
    await handleDeck('PUT', 'cmd-fixture', TEST_AUTH_HEADERS, JSON.stringify(commander), services);
    const cards = Array.from({ length: 3 }, (_, i) => ({
      ...upgradeCard,
      name: `Card ${i}`,
      oracle_tags: ['removal'],
    }));
    const res = await handleSuggestGenerate(
      TEST_AUTH_HEADERS,
      JSON.stringify({
        budgetUsd: 25,
        deckIds: ['cmd-fixture'],
        focusTags: ['removal'],
      }),
      services,
      {
        buildUpgradePool: async () => ({
          cards,
          codesKey: 'upgrade:cmd-fixture:25:focus-removal',
          codes: ['upgrade:cmd-fixture:25:focus-removal'],
          primaryCode: 'UPGRADE',
          cardCount: 3,
        }),
      },
    );
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(String(res.body));
    expect(body.focusTags).toEqual(['removal']);
    expect(body.deckResults[0].packaging?.poolCardCount).toBe(3);
    expect(body.deckResults[0].packaging?.poolCardCount).toBeLessThanOrEqual(250);
    const packages = body.deckResults[0].packages;
    if (packages?.length) {
      expect(packages[0].focusTags).toBeDefined();
      expect(Array.isArray(packages[0].focusTags)).toBe(true);
    }
  });

  it('reuses cached upgrade pool on second request', async () => {
    const { services } = createMemoryStores();
    await handleDeck('PUT', 'cmd-fixture', TEST_AUTH_HEADERS, JSON.stringify(commander), services);
    let buildCalls = 0;
    const deps = {
      buildUpgradePool: async () => {
        buildCalls += 1;
        return {
          cards: [upgradeCard],
          codesKey: 'upgrade:cmd-fixture:25',
          codes: ['upgrade:cmd-fixture:25'],
          primaryCode: 'UPGRADE',
          cardCount: 1,
        };
      },
    };
    const body = { budgetUsd: 25, deckIds: ['cmd-fixture'] };
    await handleSuggestGenerate(TEST_AUTH_HEADERS, JSON.stringify(body), services, deps);
    await handleSuggestGenerate(TEST_AUTH_HEADERS, JSON.stringify(body), services, deps);
    expect(buildCalls).toBe(1);
  });

  it('returns 502 when buildUpgradePool throws Scryfall upstream error', async () => {
    const { services } = createMemoryStores();
    await handleDeck('PUT', 'cmd-fixture', TEST_AUTH_HEADERS, JSON.stringify(commander), services);
    const err = new Error('Scryfall 503');
    (err as { code?: string }).code = 'SCRYFALL_UPSTREAM';
    const res = await handleSuggestGenerate(
      TEST_AUTH_HEADERS,
      JSON.stringify({ budgetUsd: 25, deckIds: ['cmd-fixture'] }),
      services,
      {
        buildUpgradePool: async () => {
          throw err;
        },
      },
    );
    expect(res.statusCode).toBe(502);
    expect(JSON.parse(String(res.body)).code).toBe('SCRYFALL_UPSTREAM');
  });
});
