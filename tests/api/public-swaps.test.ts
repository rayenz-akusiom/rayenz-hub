import { describe, expect, it } from 'vitest';
import { handleAuthSignIn } from '../../packages/api/src/handlers/auth-sign-in.ts';
import { handleDeck } from '../../packages/api/src/handlers/decks.ts';
import { handlePublicUserSwaps } from '../../packages/api/src/handlers/public-swaps.ts';
import { encodeTestJwt } from '../../packages/api/src/lib/jwt.ts';
import { createMemoryStores, TEST_AUTH_HEADERS } from './helpers/test-services.ts';
import commander from '../fixtures/deck-builder/commander-slice.json';

function swapDeck() {
  return {
    ...commander,
    lookingForEntries: [{ id: 'lf1', instanceId: 'c3', sortIndex: 0, notes: null }],
    formalSwapEntries: [
      {
        id: 's1',
        inInstanceId: 'c1',
        outInstanceId: 'c2',
        inTargetCategory: 'Creature',
        sortIndex: 0,
        notes: null,
      },
    ],
  };
}

describe('public user swaps GET', () => {
  it('returns redacted commander/cube queues without auth', async () => {
    const { services } = createMemoryStores();
    const ownerHeaders = {
      authorization: `Bearer ${encodeTestJwt({ sub: 'rayenz-sub', username: 'Rayenz' })}`,
    };
    const put = await handleDeck(
      'PUT',
      'cmd-fixture',
      ownerHeaders,
      JSON.stringify(swapDeck()),
      services,
    );
    expect(put.statusCode).toBe(200);

    const pub = await handlePublicUserSwaps('rayenz', {}, services);
    expect(pub.statusCode).toBe(200);
    const body = JSON.parse(String(pub.body)) as {
      username: string;
      slug: string;
      decks: Array<{ name: string; cards: Array<{ instanceId: string }> }>;
    };
    expect(body.username).toBe('rayenz');
    expect(body.slug).toBe('rayenz');
    expect(body.decks).toHaveLength(1);
    expect(body.decks[0]?.name).toBe(commander.name);
    expect(body.decks[0]?.cards.map((c) => c.instanceId).sort()).toEqual(['c1', 'c2', 'c3']);
  });

  it('returns 404 for unknown user and reserved sandbox', async () => {
    const { services } = createMemoryStores();
    await handleAuthSignIn(
      {},
      JSON.stringify({ username: 'Rayenz', password: 'test-password-1' }),
      services,
    );

    const unknown = await handlePublicUserSwaps('nobody', {}, services);
    expect(unknown.statusCode).toBe(404);

    const sandbox = await handlePublicUserSwaps('sandbox', {}, services);
    expect(sandbox.statusCode).toBe(404);
  });

  it('skips theory decks and decks with empty queues', async () => {
    const { services } = createMemoryStores();
    const ownerHeaders = {
      authorization: `Bearer ${encodeTestJwt({ sub: 'rayenz-sub', username: 'Rayenz' })}`,
    };
    await handleDeck(
      'PUT',
      'cmd-empty',
      ownerHeaders,
      JSON.stringify({ ...commander, deckId: 'cmd-empty', name: 'Empty Queue' }),
      services,
    );
    await handleDeck(
      'PUT',
      'cmd-theory',
      ownerHeaders,
      JSON.stringify({
        ...swapDeck(),
        deckId: 'cmd-theory',
        name: 'Theory Queue',
        ownership: 'theory',
      }),
      services,
    );

    const pub = await handlePublicUserSwaps('rayenz', {}, services);
    expect(pub.statusCode).toBe(200);
    expect(JSON.parse(String(pub.body)).decks).toEqual([]);
  });

  it('skips private decks', async () => {
    const { services } = createMemoryStores();
    const ownerHeaders = {
      authorization: `Bearer ${encodeTestJwt({ sub: 'rayenz-sub', username: 'Rayenz' })}`,
    };
    await handleDeck(
      'PUT',
      'cmd-private',
      ownerHeaders,
      JSON.stringify({
        ...swapDeck(),
        deckId: 'cmd-private',
        name: 'Private Queue',
        visibility: 'private',
      }),
      services,
    );

    const pub = await handlePublicUserSwaps('rayenz', {}, services);
    expect(pub.statusCode).toBe(200);
    expect(JSON.parse(String(pub.body)).decks).toEqual([]);
  });

  it('returns 429 after the public swaps rate limit', async () => {
    const { services } = createMemoryStores();
    let last = 200;
    for (let i = 0; i < 21; i++) {
      const res = await handlePublicUserSwaps(
        'nobody',
        { 'x-forwarded-for': '203.0.113.40' },
        services,
      );
      last = res.statusCode ?? 0;
    }
    expect(last).toBe(429);
  });

  it('does not expose another partition via public slug', async () => {
    const { services } = createMemoryStores();
    await handleDeck('PUT', 'cmd-fixture', TEST_AUTH_HEADERS, JSON.stringify(swapDeck()), services);
    await handleAuthSignIn(
      {},
      JSON.stringify({ username: 'Rayenz', password: 'test-password-1' }),
      services,
    );

    const pub = await handlePublicUserSwaps('rayenz', {}, services);
    expect(pub.statusCode).toBe(200);
    expect(JSON.parse(String(pub.body)).decks).toEqual([]);
  });
});
