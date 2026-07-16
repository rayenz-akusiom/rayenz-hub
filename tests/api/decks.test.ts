import { describe, expect, it } from 'vitest';
import { handleDeck, handleListDecks } from '../../packages/api/src/handlers/decks.ts';
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
    expect(s3.snapshot().has('decks/cmd-fixture.json')).toBe(true);
  });

  it('lists and deletes decks', async () => {
    const { services, s3 } = createMemoryStores();
    await handleDeck('PUT', 'cmd-fixture', TEST_AUTH_HEADERS, JSON.stringify(commander), services);
    const list = await handleListDecks(TEST_AUTH_HEADERS, services);
    expect(list.statusCode).toBe(200);
    expect(JSON.parse(String(list.body)).decks).toHaveLength(1);

    const del = await handleDeck('DELETE', 'cmd-fixture', TEST_AUTH_HEADERS, null, services);
    expect(del.statusCode).toBe(204);
    expect(s3.snapshot().has('decks/cmd-fixture.json')).toBe(false);
  });
});
