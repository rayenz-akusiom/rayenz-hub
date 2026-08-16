import { describe, expect, it } from 'vitest';
import { pageIsOverCap, proposePageIds, remainingIds } from '../../../packages/web/src/deck-suggest/paging.ts';

describe('deck-suggest paging', () => {
  it('proposes the next cap-sized slice and remaining ids', () => {
    const eligible = ['a', 'b', 'c', 'd', 'e'];
    expect(proposePageIds(eligible, [], 2)).toEqual(['a', 'b']);
    expect(proposePageIds(eligible, ['a', 'b'], 2)).toEqual(['c', 'd']);
    expect(remainingIds(eligible, ['a', 'b', 'c'])).toEqual(['d', 'e']);
    expect(pageIsOverCap(['a', 'b', 'c'], 2)).toBe(true);
    expect(pageIsOverCap(['a', 'b'], 2)).toBe(false);
  });
});
