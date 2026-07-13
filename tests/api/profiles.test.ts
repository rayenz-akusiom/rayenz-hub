import { describe, expect, it } from 'vitest';
import { handleListProfiles, handleProfile } from '../../packages/api/src/handlers/profiles.ts';
import { createMemoryStores, TEST_AUTH_HEADERS } from './helpers/test-services.ts';

describe('profiles API', () => {
  it('stores profile in DDB and S3', async () => {
    const { memory, s3, services } = createMemoryStores();
    const put = await handleProfile(
      'PUT',
      'deck-1',
      TEST_AUTH_HEADERS,
      JSON.stringify({
        deckName: 'Test Deck',
        protectedCards: ['Sol Ring'],
        blockedCards: ['Opponent Card'],
      }),
      services,
    );
    expect(put.statusCode).toBe(200);
    const body = JSON.parse(String(put.body));
    expect(body.protectedCards).toEqual(['Sol Ring']);
    expect(body.yaml).toContain('protected_cards:');

    const get = await handleProfile('GET', 'deck-1', TEST_AUTH_HEADERS, null, services);
    expect(get.statusCode).toBe(200);
    expect(JSON.parse(String(get.body)).yaml).toContain('Sol Ring');

    const stored = [...memory.snapshot().values()][0];
    expect(stored.PK).toBe('USER::default');
    expect(stored.SK).toBe('PROFILE::deck-1');
    expect(s3.snapshot().has('profiles/deck-1.yaml')).toBe(true);
  });

  it('lists profile summaries', async () => {
    const { services } = createMemoryStores();
    await handleProfile(
      'PUT',
      'deck-a',
      TEST_AUTH_HEADERS,
      JSON.stringify({ protectedCards: [], blockedCards: [] }),
      services,
    );
    const list = await handleListProfiles(TEST_AUTH_HEADERS, services);
    expect(list.statusCode).toBe(200);
    expect(JSON.parse(String(list.body)).profiles).toHaveLength(1);
  });
});
