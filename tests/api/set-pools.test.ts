import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { INLINE_SET_POOL_MAX_BYTES } from '../../packages/shared/src/schemas/entities.ts';
import { handleSetPool } from '../../packages/api/src/handlers/set-pools.ts';
import { SetPoolRepository } from '../../packages/api/src/repositories/set-pool-repository.ts';
import { MemoryDocClient } from './helpers/memory-dynamo.ts';
import { MemoryS3Store } from './helpers/memory-s3.ts';
import { asBlobStore } from './helpers/test-blob-store.ts';

const API_KEY = 'test-api-key-local';
const AUTH = { authorization: `Bearer ${API_KEY}` };

describe('set pool API', () => {
  let memory: MemoryDocClient;
  let s3: MemoryS3Store;
  let repo: SetPoolRepository;

  beforeEach(() => {
    process.env.HUB_API_KEY = API_KEY;
    memory = new MemoryDocClient();
    s3 = new MemoryS3Store();
    repo = new SetPoolRepository(memory, 'HubTable', asBlobStore(s3));
  });

  afterEach(() => {
    delete process.env.HUB_API_KEY;
  });

  it('stores small pools inline', async () => {
    const cards = [{ name: 'Card A' }];
    const put = await handleSetPool(
      'PUT',
      'MSH',
      AUTH,
      JSON.stringify({ codes: ['MSH'], complete: true, cards }),
      { setPoolRepo: repo },
    );
    expect(put.statusCode).toBe(200);
    const item = [...memory.snapshot().values()][0];
    expect(item.inlineCards).toBe(true);
    expect(item.s3Key).toBeUndefined();
  });

  it('stores large pools in S3', async () => {
    const big = 'x'.repeat(INLINE_SET_POOL_MAX_BYTES);
    const cards = [{ name: big }];
    await handleSetPool(
      'PUT',
      'MAR,MSH',
      AUTH,
      JSON.stringify({ codes: ['MAR', 'MSH'], complete: true, cards }),
      { setPoolRepo: repo },
    );
    const item = [...memory.snapshot().values()][0];
    expect(item.inlineCards).toBe(false);
    expect(item.s3Key).toBe('set-pools/MAR,MSH.json');
    expect(s3.snapshot().has('set-pools/MAR,MSH.json')).toBe(true);
  });
});
