import { describe, expect, it } from 'vitest';
import { mapPool } from '../../../packages/shared/src/async/map-pool.ts';

describe('mapPool', () => {
  it('preserves order with bounded concurrency', async () => {
    const active: number[] = [];
    let maxActive = 0;
    const results = await mapPool([1, 2, 3, 4, 5], 2, async (n) => {
      active.push(n);
      maxActive = Math.max(maxActive, active.length);
      await new Promise((r) => setTimeout(r, 5));
      active.splice(active.indexOf(n), 1);
      return n * 10;
    });
    expect(results).toEqual([10, 20, 30, 40, 50]);
    expect(maxActive).toBeLessThanOrEqual(2);
  });

  it('returns empty for empty input', async () => {
    expect(await mapPool([], 4, async (x) => x)).toEqual([]);
  });
});
