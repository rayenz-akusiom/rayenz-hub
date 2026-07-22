import { describe, it, expect } from 'vitest';
import {
  defaultBrowseForSwapQueuePath,
  defaultLayoutForSwapQueuePath,
  pathFromHash,
  KNOWN_PATHS,
} from '../../../packages/web/src/hub/routes.ts';

describe('swap-queue routes', () => {
  it('knows /swap-queue and /wishlist', () => {
    expect(KNOWN_PATHS.has('/swap-queue')).toBe(true);
    expect(KNOWN_PATHS.has('/wishlist')).toBe(true);
  });

  it('maps path defaults for browse + layout', () => {
    expect(defaultBrowseForSwapQueuePath('/swap-queue')).toBe('default');
    expect(defaultBrowseForSwapQueuePath('/wishlist')).toBe('default');
    expect(defaultLayoutForSwapQueuePath('/swap-queue')).toBe('tiles');
    expect(defaultLayoutForSwapQueuePath('/wishlist')).toBe('grid');
  });

  it('parses hashes and redirects draft swap-wants', () => {
    expect(pathFromHash('#/swap-queue')).toBe('/swap-queue');
    expect(pathFromHash('#/wishlist')).toBe('/wishlist');
    expect(pathFromHash('#/swap-wants')).toBe('/swap-queue');
  });
});
