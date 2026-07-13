import { describe, expect, it } from 'vitest';
import { INLINE_SET_POOL_MAX_BYTES } from '../../packages/shared/src/schemas/entities.ts';
import { handleSetPool } from '../../packages/api/src/handlers/set-pools.ts';
import { SetPoolRepository } from '../../packages/api/src/repositories/set-pool-repository.ts';
import { MemoryDocClient } from './helpers/memory-dynamo.ts';
import { MemoryS3Store } from './helpers/memory-s3.ts';
import { asBlobStore } from './helpers/test-blob-store.ts';
import { TEST_AUTH_HEADERS, createTestServices } from './helpers/test-services.ts';

describe('set pool API', () => {
  it('stores small pools inline', async () => {
    const memory = new MemoryDocClient();
    const services = createTestServices({
      setPoolRepository: new SetPoolRepository(memory, 'HubTable', asBlobStore(new MemoryS3Store())),
    });
    const cards = [{ name: 'Card A' }];
    const put = await handleSetPool(
      'PUT',
      'MSH',
      TEST_AUTH_HEADERS,
      JSON.stringify({ codes: ['MSH'], complete: true, cards }),
      services,
    );
    expect(put.statusCode).toBe(200);
    const item = [...memory.snapshot().values()][0];
    expect(item.inlineCards).toBe(true);
    expect(item.s3Key).toBeUndefined();
  });

  it('stores large pools in S3', async () => {
    const memory = new MemoryDocClient();
    const s3 = new MemoryS3Store();
    const services = createTestServices({
      setPoolRepository: new SetPoolRepository(memory, 'HubTable', asBlobStore(s3)),
    });
    const big = 'x'.repeat(INLINE_SET_POOL_MAX_BYTES);
    const cards = [{ name: big }];
    await handleSetPool(
      'PUT',
      'MAR,MSH',
      TEST_AUTH_HEADERS,
      JSON.stringify({ codes: ['MAR', 'MSH'], complete: true, cards }),
      services,
    );
    const item = [...memory.snapshot().values()][0];
    expect(item.inlineCards).toBe(false);
    expect(item.s3Key).toBe('set-pools/MAR,MSH.json');
    expect(s3.snapshot().has('set-pools/MAR,MSH.json')).toBe(true);
  });
});
