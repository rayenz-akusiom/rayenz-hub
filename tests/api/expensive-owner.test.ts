import { describe, expect, it } from 'vitest';
import { handleDeckGlance } from '../../packages/api/src/handlers/deck-glance.ts';
import { handleListDecks } from '../../packages/api/src/handlers/decks.ts';
import { handleSuggestGenerate } from '../../packages/api/src/handlers/suggest-generate.ts';
import { handleSwapsGlance } from '../../packages/api/src/handlers/swaps-glance.ts';
import { encodeTestJwt } from '../../packages/api/src/lib/jwt.ts';
import { createMemoryStores } from './helpers/test-services.ts';

const FRIEND_HEADERS = {
  authorization: `Bearer ${encodeTestJwt({ sub: 'friend-sub', username: 'friend' })}`,
};

function ownerRequiredBody(res: { statusCode?: number; body?: unknown }) {
  expect(res.statusCode).toBe(403);
  const body = JSON.parse(String(res.body)) as { error?: string; code?: string };
  expect(body.code).toBe('OWNER_REQUIRED');
  return body;
}

describe('expensive APIs are owner-only', () => {
  it('rejects a non-owner JWT on glance and swaps glance', async () => {
    const { services } = createMemoryStores();

    const glance = await handleDeckGlance('any-deck', FRIEND_HEADERS, null, services);
    ownerRequiredBody(glance);

    const swaps = await handleSwapsGlance(
      FRIEND_HEADERS,
      JSON.stringify({
        mode: 'in_only',
        includeSeeking: false,
        items: [{ deckId: 'd1', kind: 'queued_in', entryId: 'e1' }],
      }),
      services,
    );
    ownerRequiredBody(swaps);
  });

  it('allows a signed-in non-owner to generate suggestions', async () => {
    const { services } = createMemoryStores();
    const generate = await handleSuggestGenerate(
      FRIEND_HEADERS,
      JSON.stringify({ deckIds: ['d1'], setCodes: ['eoe'] }),
      services,
      {
        fetchSetCards: async () => ({
          set_codes: ['EOE'],
          primary_set_code: 'EOE',
          product_name: 'Edge of Eternities',
          sets: [],
          expected_card_count: 0,
          fetched_card_count: 0,
          cards: [],
        }),
      },
    );
    expect(generate.statusCode).toBe(200);
  });

  it('still allows ordinary deck list for a non-owner', async () => {
    const { services } = createMemoryStores();
    const decks = await handleListDecks(FRIEND_HEADERS, services);
    expect(decks.statusCode).toBe(200);
    expect(JSON.parse(String(decks.body)).decks).toEqual([]);
  });
});
