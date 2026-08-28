import { describe, expect, it } from 'vitest';
import { handleProfileTagCandidates } from '../../packages/api/src/handlers/profile-tag-candidates.ts';
import { handleDeck } from '../../packages/api/src/handlers/decks.ts';
import { encodeTestJwt } from '../../packages/api/src/lib/jwt.ts';
import { createMemoryStores, TEST_AUTH_HEADERS } from './helpers/test-services.ts';
import commander from '../fixtures/deck-builder/commander-slice.json';

describe('GET /v1/profiles/{deckId}/tag-candidates', () => {
  it('returns 401 without a session', async () => {
    const { services } = createMemoryStores();
    const res = await handleProfileTagCandidates('cmd-fixture', {}, 'Sol Ring', services);
    expect(res.statusCode).toBe(401);
  });

  it('returns 400 when cards param empty', async () => {
    const { services } = createMemoryStores();
    const res = await handleProfileTagCandidates('cmd-fixture', TEST_AUTH_HEADERS, '', services);
    expect(res.statusCode).toBe(400);
  });

  it('aggregates tags for up to 5 cards', async () => {
    const { services } = createMemoryStores();
    await handleDeck('PUT', 'cmd-fixture', TEST_AUTH_HEADERS, JSON.stringify(commander), services);
    const res = await handleProfileTagCandidates(
      'cmd-fixture',
      TEST_AUTH_HEADERS,
      'Sol Ring,Ashnod%27s Altar',
      services,
      {
        fetchCardByExactName: async (name) => ({
          name,
          oracle_id: name.toLowerCase(),
        }),
        maybeAttachScryfallTags: async (cards) =>
          cards.map((c) => ({
            ...c,
            oracle_tags: c.name === 'Sol Ring' ? ['artifact', 'mana-production'] : ['sacrifice'],
          })),
      },
    );
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(String(res.body));
    expect(body.tags).toEqual(['artifact', 'mana-production', 'sacrifice']);
    expect(body.byCard['Sol Ring']).toContain('mana-production');
  });

  it('returns 400 when more than 5 cards requested', async () => {
    const { services } = createMemoryStores();
    await handleDeck('PUT', 'cmd-fixture', TEST_AUTH_HEADERS, JSON.stringify(commander), services);
    const res = await handleProfileTagCandidates(
      'cmd-fixture',
      TEST_AUTH_HEADERS,
      'A,B,C,D,E,F',
      services,
    );
    expect(res.statusCode).toBe(400);
  });

  it('returns 404 when deck missing', async () => {
    const { services } = createMemoryStores();
    const res = await handleProfileTagCandidates(
      'missing',
      TEST_AUTH_HEADERS,
      'Sol Ring',
      services,
      {
        fetchCardByExactName: async () => ({ name: 'Sol Ring', oracle_id: 'x' }),
        maybeAttachScryfallTags: async (cards) =>
          cards.map((c) => ({ ...c, oracle_tags: ['artifact'] })),
      },
    );
    expect(res.statusCode).toBe(404);
  });
});
