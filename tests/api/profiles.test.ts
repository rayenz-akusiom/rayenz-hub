import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { handleListProfiles, handleProfile } from '../../packages/api/src/handlers/profiles.ts';
import { ProfileRepository } from '../../packages/api/src/repositories/profile-repository.ts';
import { MemoryDocClient } from './helpers/memory-dynamo.ts';
import { MemoryS3Store } from './helpers/memory-s3.ts';
import { asBlobStore } from './helpers/test-blob-store.ts';

const API_KEY = 'test-api-key-local';
const AUTH = { authorization: `Bearer ${API_KEY}` };

describe('profiles API', () => {
  let memory: MemoryDocClient;
  let s3: MemoryS3Store;
  let repo: ProfileRepository;

  beforeEach(() => {
    process.env.HUB_API_KEY = API_KEY;
    process.env.HUB_USER_ID = 'default';
    memory = new MemoryDocClient();
    s3 = new MemoryS3Store();
    repo = new ProfileRepository(memory, 'HubTable', asBlobStore(s3));
  });

  afterEach(() => {
    delete process.env.HUB_API_KEY;
  });

  it('stores profile in DDB and S3', async () => {
    const put = await handleProfile(
      'PUT',
      'deck-1',
      AUTH,
      JSON.stringify({
        deckName: 'Test Deck',
        protectedCards: ['Sol Ring'],
        blockedCards: ['Opponent Card'],
      }),
      { profileRepo: repo },
    );
    expect(put.statusCode).toBe(200);
    const body = JSON.parse(String(put.body));
    expect(body.protectedCards).toEqual(['Sol Ring']);
    expect(body.yaml).toContain('protected_cards:');

    const get = await handleProfile('GET', 'deck-1', AUTH, null, { profileRepo: repo });
    expect(get.statusCode).toBe(200);
    expect(JSON.parse(String(get.body)).yaml).toContain('Sol Ring');

    const stored = [...memory.snapshot().values()][0];
    expect(stored.PK).toBe('USER::default');
    expect(stored.SK).toBe('PROFILE::deck-1');
    expect(s3.snapshot().has('profiles/deck-1.yaml')).toBe(true);
  });

  it('lists profile summaries', async () => {
    await handleProfile('PUT', 'deck-a', AUTH, JSON.stringify({ protectedCards: [], blockedCards: [] }), { profileRepo: repo });
    const list = await handleListProfiles(AUTH, { profileRepo: repo });
    expect(list.statusCode).toBe(200);
    expect(JSON.parse(String(list.body)).profiles).toHaveLength(1);
  });
});
