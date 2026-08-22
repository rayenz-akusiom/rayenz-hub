import { describe, expect, it } from 'vitest';
import { handleDeck, handleListDecks } from '../../packages/api/src/handlers/decks.ts';
import { MAX_LIBRARY_DECKS } from '../../packages/shared/src/schemas/deck-builder.ts';
import { createMemoryStores, TEST_AUTH_HEADERS } from './helpers/test-services.ts';
import commander from '../fixtures/deck-builder/commander-slice.json';

describe('decks API', () => {
  it('stores full deck document in DDB meta + S3 body', async () => {
    const { memory, s3, services } = createMemoryStores();
    const put = await handleDeck(
      'PUT',
      'cmd-fixture',
      TEST_AUTH_HEADERS,
      JSON.stringify(commander),
      services,
    );
    expect(put.statusCode).toBe(200);
    const body = JSON.parse(String(put.body));
    expect(body.deckId).toBe('cmd-fixture');
    expect(body.cards.length).toBeGreaterThan(0);

    const get = await handleDeck('GET', 'cmd-fixture', TEST_AUTH_HEADERS, null, services);
    expect(get.statusCode).toBe(200);
    expect(JSON.parse(String(get.body)).name).toBe(commander.name);

    const stored = [...memory.snapshot().values()][0];
    expect(stored.SK).toBe('DECK::cmd-fixture');
    expect(s3.snapshot().has('users/default/decks/cmd-fixture.json')).toBe(true);
  });

  it('lists and deletes decks', async () => {
    const { services, s3 } = createMemoryStores();
    await handleDeck('PUT', 'cmd-fixture', TEST_AUTH_HEADERS, JSON.stringify(commander), services);
    const list = await handleListDecks(TEST_AUTH_HEADERS, services);
    expect(list.statusCode).toBe(200);
    expect(JSON.parse(String(list.body)).decks).toHaveLength(1);

    const del = await handleDeck('DELETE', 'cmd-fixture', TEST_AUTH_HEADERS, null, services);
    expect(del.statusCode).toBe(204);
    expect(s3.snapshot().has('users/default/decks/cmd-fixture.json')).toBe(false);
  });

  it('patches deck list with card ops without full document', async () => {
    const { services } = createMemoryStores();
    const put = await handleDeck(
      'PUT',
      'cmd-fixture',
      TEST_AUTH_HEADERS,
      JSON.stringify(commander),
      services,
    );
    const before = JSON.parse(String(put.body));
    const beforeCount = before.cards.length;

    const patch = await handleDeck(
      'PATCH',
      'cmd-fixture',
      TEST_AUTH_HEADERS,
      JSON.stringify({
        expectedUpdatedAt: before.updatedAt,
        cardOps: [
          {
            op: 'add',
            card: {
              name: 'Sol Ring',
              primaryCategory: 'Artifact',
              categories: ['Artifact'],
            },
          },
          { op: 'remove', instanceId: 'c3' },
        ],
      }),
      services,
    );
    expect(patch.statusCode).toBe(200);
    const after = JSON.parse(String(patch.body));
    expect(after.cards.some((c: { name: string }) => c.name === 'Sol Ring')).toBe(true);
    expect(after.cards.some((c: { instanceId: string }) => c.instanceId === 'c3')).toBe(false);
    expect(after.cards.length).toBe(beforeCount); // +1 -1
    expect(after.updatedAt).not.toBe(before.updatedAt);
  });

  it('returns 409 when expectedUpdatedAt conflicts', async () => {
    const { services } = createMemoryStores();
    await handleDeck('PUT', 'cmd-fixture', TEST_AUTH_HEADERS, JSON.stringify(commander), services);

    const patch = await handleDeck(
      'PATCH',
      'cmd-fixture',
      TEST_AUTH_HEADERS,
      JSON.stringify({
        expectedUpdatedAt: '1999-01-01T00:00:00.000Z',
        name: 'Renamed',
      }),
      services,
    );
    expect(patch.statusCode).toBe(409);
    expect(JSON.parse(String(patch.body)).code).toBe('CONFLICT');
  });

  it('returns 400 for empty patch and unknown instance', async () => {
    const { services } = createMemoryStores();
    await handleDeck('PUT', 'cmd-fixture', TEST_AUTH_HEADERS, JSON.stringify(commander), services);

    const empty = await handleDeck(
      'PATCH',
      'cmd-fixture',
      TEST_AUTH_HEADERS,
      JSON.stringify({}),
      services,
    );
    expect(empty.statusCode).toBe(400);

    const unknown = await handleDeck(
      'PATCH',
      'cmd-fixture',
      TEST_AUTH_HEADERS,
      JSON.stringify({ cardOps: [{ op: 'remove', instanceId: 'missing-id' }] }),
      services,
    );
    expect(unknown.statusCode).toBe(400);
    expect(JSON.parse(String(unknown.body)).code).toBe('UNKNOWN_INSTANCE');
  });

  it('rejects a 51st new deck and still allows updating an existing one', async () => {
    const { services } = createMemoryStores();
    for (let i = 0; i < MAX_LIBRARY_DECKS; i++) {
      const id = `deck-${i}`;
      const put = await handleDeck(
        'PUT',
        id,
        TEST_AUTH_HEADERS,
        JSON.stringify({ ...commander, deckId: id, name: `Deck ${i}` }),
        services,
      );
      expect(put.statusCode).toBe(200);
    }

    const blocked = await handleDeck(
      'PUT',
      'deck-extra',
      TEST_AUTH_HEADERS,
      JSON.stringify({ ...commander, deckId: 'deck-extra', name: 'Extra' }),
      services,
    );
    expect(blocked.statusCode).toBe(409);
    expect(JSON.parse(String(blocked.body)).code).toBe('CONFLICT');

    const update = await handleDeck(
      'PUT',
      'deck-0',
      TEST_AUTH_HEADERS,
      JSON.stringify({ ...commander, deckId: 'deck-0', name: 'Updated' }),
      services,
    );
    expect(update.statusCode).toBe(200);
    expect(JSON.parse(String(update.body)).name).toBe('Updated');
  });
});
