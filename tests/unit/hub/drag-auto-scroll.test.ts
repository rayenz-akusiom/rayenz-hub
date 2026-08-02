import { afterEach, describe, expect, it } from 'vitest';
import {
  DRAG_SCROLL_EDGE_PX,
  DRAG_SCROLL_MAX_PX,
  edgeScrollDelta,
  isInVerticalScrollbarGutter,
  resolveDeckBuilderScrollRoot,
  scrollbarTrackScrollTop,
  wheelDeltaPixels,
} from '../../../packages/web/src/deck-builder/browse/useDragAutoScroll';

afterEach(() => {
  document.body.innerHTML = '';
});

const rect = { top: 100, bottom: 500, height: 400 };

describe('edgeScrollDelta', () => {
  it('returns 0 outside the edge bands', () => {
    expect(edgeScrollDelta(300, rect)).toBe(0);
    expect(edgeScrollDelta(100 + DRAG_SCROLL_EDGE_PX, rect)).toBe(0);
    expect(edgeScrollDelta(500 - DRAG_SCROLL_EDGE_PX, rect)).toBe(0);
  });

  it('scrolls up near the top edge, stronger closer to the edge', () => {
    const near = edgeScrollDelta(100 + DRAG_SCROLL_EDGE_PX / 2, rect);
    const closer = edgeScrollDelta(100 + 1, rect);
    expect(near).toBeLessThan(0);
    expect(closer).toBeLessThan(near);
    expect(closer).toBeGreaterThanOrEqual(-DRAG_SCROLL_MAX_PX);
  });

  it('scrolls down near the bottom edge, stronger closer to the edge', () => {
    const near = edgeScrollDelta(500 - DRAG_SCROLL_EDGE_PX / 2, rect);
    const closer = edgeScrollDelta(500 - 1, rect);
    expect(near).toBeGreaterThan(0);
    expect(closer).toBeGreaterThan(near);
    expect(closer).toBeLessThanOrEqual(DRAG_SCROLL_MAX_PX);
  });

  it('returns 0 for invalid geometry', () => {
    expect(edgeScrollDelta(120, rect, 0)).toBe(0);
    expect(edgeScrollDelta(120, { top: 0, bottom: 0, height: 0 })).toBe(0);
  });
});

describe('scrollbarTrackScrollTop', () => {
  function fakeRoot(overrides: Partial<{
    top: number;
    height: number;
    scrollHeight: number;
    clientHeight: number;
  }> = {}) {
    const top = overrides.top ?? 0;
    const height = overrides.height ?? 400;
    const scrollHeight = overrides.scrollHeight ?? 2000;
    const clientHeight = overrides.clientHeight ?? 400;
    return {
      getBoundingClientRect: () =>
        ({
          top,
          bottom: top + height,
          height,
          left: 0,
          right: 300,
          width: 300,
          x: 0,
          y: top,
          toJSON: () => ({}),
        }) as DOMRect,
      scrollHeight,
      clientHeight,
    };
  }

  it('maps top/bottom of the track to 0 and max scroll', () => {
    const root = fakeRoot();
    expect(scrollbarTrackScrollTop(0, root)).toBe(0);
    expect(scrollbarTrackScrollTop(400, root)).toBe(1600);
  });

  it('maps mid-track proportionally and clamps outside', () => {
    const root = fakeRoot();
    expect(scrollbarTrackScrollTop(200, root)).toBe(800);
    expect(scrollbarTrackScrollTop(-50, root)).toBe(0);
    expect(scrollbarTrackScrollTop(999, root)).toBe(1600);
  });

  it('returns 0 when content does not overflow', () => {
    const root = fakeRoot({ scrollHeight: 400, clientHeight: 400 });
    expect(scrollbarTrackScrollTop(200, root)).toBe(0);
  });
});

describe('isInVerticalScrollbarGutter', () => {
  it('detects the gutter past clientWidth', () => {
    const root = {
      clientWidth: 280,
      getBoundingClientRect: () =>
        ({
          left: 10,
          right: 310,
          top: 0,
          bottom: 400,
          width: 300,
          height: 400,
          x: 10,
          y: 0,
          toJSON: () => ({}),
        }) as DOMRect,
    };
    expect(isInVerticalScrollbarGutter(289, root)).toBe(false);
    expect(isInVerticalScrollbarGutter(290, root)).toBe(true);
    expect(isInVerticalScrollbarGutter(310, root)).toBe(true);
    expect(isInVerticalScrollbarGutter(311, root)).toBe(false);
  });
});

describe('resolveDeckBuilderScrollRoot', () => {
  it('prefers a scrollable .hub-main when present', () => {
    const main = document.createElement('main');
    main.className = 'hub-main';
    Object.defineProperty(main, 'scrollHeight', { value: 2000, configurable: true });
    Object.defineProperty(main, 'clientHeight', { value: 500, configurable: true });
    document.body.appendChild(main);
    expect(resolveDeckBuilderScrollRoot(document)).toBe(main);
  });

  it('falls back to document.scrollingElement without .hub-main', () => {
    expect(resolveDeckBuilderScrollRoot(document)).toBe(document.scrollingElement);
  });
});

describe('wheelDeltaPixels', () => {
  it('uses raw deltaY for pixel mode', () => {
    expect(wheelDeltaPixels({ deltaY: 120, deltaMode: 0 })).toBe(120);
    expect(wheelDeltaPixels({ deltaY: -40, deltaMode: 0 })).toBe(-40);
  });

  it('scales by line height for line mode', () => {
    expect(wheelDeltaPixels({ deltaY: 3, deltaMode: 1 }, 16)).toBe(48);
    expect(wheelDeltaPixels({ deltaY: -2, deltaMode: 1 }, 20)).toBe(-40);
  });

  it('scales by page height for page mode', () => {
    expect(wheelDeltaPixels({ deltaY: 1, deltaMode: 2 }, 16, 500)).toBe(500);
    expect(wheelDeltaPixels({ deltaY: -1, deltaMode: 2 }, 16, 800)).toBe(-800);
  });
});
