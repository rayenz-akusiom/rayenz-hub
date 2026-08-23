import { describe, it, expect } from 'vitest';
import {
  defaultBrowseForSwapQueuePath,
  defaultLayoutForSwapQueuePath,
  parseSwapQueueRoute,
  pathFromHash,
  swapQueueHash,
  swapQueuePairHash,
  swapQueueShareUrl,
  rewriteRetiredUserSlug,
  hashForSwapQueueRoute,
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
    expect(defaultLayoutForSwapQueuePath('/wishlist/rayenz')).toBe('grid');
  });

  it('parses hashes and redirects draft swap-wants', () => {
    expect(pathFromHash('#/swap-queue')).toBe('/swap-queue');
    expect(pathFromHash('#/wishlist')).toBe('/wishlist');
    expect(pathFromHash('#/swap-wants')).toBe('/swap-queue');
    expect(pathFromHash('#/swap-queue/rayenz')).toBe('/swap-queue');
    expect(pathFromHash('#/wishlist/rayenz')).toBe('/wishlist');
  });

  it('parses and builds username share hashes', () => {
    expect(parseSwapQueueRoute('#/swap-queue')).toBeNull();
    expect(parseSwapQueueRoute('#/swap-queue/')).toBeNull();
    expect(parseSwapQueueRoute('#/swap-queue/rayenz/extra')).toBeNull();
    expect(parseSwapQueueRoute('#/swap-queue/rayenz')).toEqual({ userSlug: 'rayenz' });
    expect(parseSwapQueueRoute('#/wishlist/rayenz')).toEqual({ userSlug: 'rayenz' });
    expect(swapQueueHash()).toBe('#/swap-queue');
    expect(swapQueueHash('rayenz')).toBe('#/swap-queue/rayenz');
    expect(swapQueueHash('rayenz', 'wishlist')).toBe('#/wishlist/rayenz');
    expect(parseSwapQueueRoute('#/swap-queue/rayenz/pair/cmd1/s1')).toEqual({
      userSlug: 'rayenz',
      pairDeckId: 'cmd1',
      pairEntryId: 's1',
    });
    expect(swapQueuePairHash('rayenz', 'cmd1', 's1')).toBe(
      '#/swap-queue/rayenz/pair/cmd1/s1',
    );
    expect(
      hashForSwapQueueRoute(
        { userSlug: 'rayenz', pairDeckId: 'cmd1', pairEntryId: 's1' },
        'wishlist',
      ),
    ).toBe('#/wishlist/rayenz/pair/cmd1/s1');
    expect(pathFromHash('#/swap-queue/rayenz/pair/cmd1/s1')).toBe('/swap-queue');
    expect(
      swapQueueShareUrl('rayenz', { origin: 'https://example.test', pathname: '/hub/' }),
    ).toBe('https://example.test/hub/#/swap-queue/rayenz');
  });

  it('rewrites retired default slugs onto the owner', () => {
    expect(rewriteRetiredUserSlug('default')).toBe('rayenz');
    expect(rewriteRetiredUserSlug('rayenz')).toBe('rayenz');
  });
});
