import { describe, expect, it } from 'vitest';
import {
  compensateScrollToPinnedTop,
  STACK_EXPAND_COLLAPSE_MS,
} from '../../../packages/web/src/deck-builder/browse/useStackExpandScrollPin.ts';

describe('compensateScrollToPinnedTop', () => {
  it('does nothing when the element top already matches the pin', () => {
    const scrollParent = { scrollTop: 100 };
    const el = { getBoundingClientRect: () => ({ top: 200 }) };

    expect(compensateScrollToPinnedTop(scrollParent, el, 200)).toBe(0);
    expect(scrollParent.scrollTop).toBe(100);
  });

  it('increases scrollTop when the element drifts downward (content expanded above)', () => {
    const scrollParent = { scrollTop: 50 };
    const el = { getBoundingClientRect: () => ({ top: 280 }) };

    expect(compensateScrollToPinnedTop(scrollParent, el, 200)).toBe(80);
    expect(scrollParent.scrollTop).toBe(130);
  });

  it('decreases scrollTop when the element drifts upward (content collapsed above)', () => {
    const scrollParent = { scrollTop: 200 };
    const el = { getBoundingClientRect: () => ({ top: 150 }) };

    expect(compensateScrollToPinnedTop(scrollParent, el, 220)).toBe(-70);
    expect(scrollParent.scrollTop).toBe(130);
  });

  it('keeps the pin across successive compensation steps', () => {
    const scrollParent = { scrollTop: 0 };
    let top = 100;
    const el = { getBoundingClientRect: () => ({ top }) };
    const pinnedTop = 100;

    top = 140;
    compensateScrollToPinnedTop(scrollParent, el, pinnedTop);
    // After scroll adjust, simulate layout settling at pinned top again
    top = pinnedTop;
    expect(compensateScrollToPinnedTop(scrollParent, el, pinnedTop)).toBe(0);
    expect(scrollParent.scrollTop).toBe(40);
  });
});

describe('STACK_EXPAND_COLLAPSE_MS', () => {
  it('covers the CSS margin transition duration with a small buffer', () => {
    expect(STACK_EXPAND_COLLAPSE_MS).toBeGreaterThanOrEqual(450);
  });
});
