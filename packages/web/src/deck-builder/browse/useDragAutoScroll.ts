import { useEffect } from 'react';
import { isDeckBuilderDragTypes } from './CardTile';

/** Viewport/container edge band that triggers auto-scroll (px). */
export const DRAG_SCROLL_EDGE_PX = 48;
/** Max vertical scroll per animation frame while near an edge (px). */
export const DRAG_SCROLL_MAX_PX = 20;

type ScrollRoot = HTMLElement | Element;

/** Prefer `.hub-main` when it can scroll; else the document scrolling element. */
export function resolveDeckBuilderScrollRoot(
  doc: Document = document,
): ScrollRoot | null {
  const main = doc.querySelector('.hub-main');
  if (main instanceof HTMLElement) {
    const style = doc.defaultView?.getComputedStyle(main);
    const overflowY = style?.overflowY ?? '';
    const canOverflow =
      overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay';
    if (canOverflow || main.scrollHeight > main.clientHeight) {
      return main;
    }
  }
  return doc.scrollingElement;
}

/**
 * Signed scroll delta for a pointer Y inside `rect`.
 * Negative near the top edge, positive near the bottom; 0 outside the edge band.
 */
export function edgeScrollDelta(
  clientY: number,
  rect: { top: number; bottom: number; height: number },
  edgePx: number = DRAG_SCROLL_EDGE_PX,
  maxPx: number = DRAG_SCROLL_MAX_PX,
): number {
  if (edgePx <= 0 || maxPx <= 0 || rect.height <= 0) return 0;
  const topDist = clientY - rect.top;
  if (topDist >= 0 && topDist < edgePx) {
    const t = 1 - topDist / edgePx;
    return -Math.ceil(t * maxPx);
  }
  const bottomDist = rect.bottom - clientY;
  if (bottomDist >= 0 && bottomDist < edgePx) {
    const t = 1 - bottomDist / edgePx;
    return Math.ceil(t * maxPx);
  }
  return 0;
}

/** True when `clientX` sits over the element's vertical scrollbar gutter. */
export function isInVerticalScrollbarGutter(
  clientX: number,
  root: { getBoundingClientRect(): DOMRect; clientWidth: number },
): boolean {
  const rect = root.getBoundingClientRect();
  const gutterLeft = rect.left + root.clientWidth;
  return clientX >= gutterLeft && clientX <= rect.right;
}

/**
 * Map pointer Y along the scrollbar track to a `scrollTop` for `root`.
 * Clamped to `[0, scrollHeight - clientHeight]`.
 */
export function scrollbarTrackScrollTop(
  clientY: number,
  root: {
    getBoundingClientRect(): DOMRect;
    scrollHeight: number;
    clientHeight: number;
  },
): number {
  const rect = root.getBoundingClientRect();
  const maxScroll = Math.max(0, root.scrollHeight - root.clientHeight);
  if (maxScroll <= 0 || rect.height <= 0) return 0;
  const t = (clientY - rect.top) / rect.height;
  return Math.round(Math.min(1, Math.max(0, t)) * maxScroll);
}

/** Default line height used when `WheelEvent.deltaMode` is DOM_DELTA_LINE. */
export const WHEEL_LINE_PX = 16;

/**
 * Convert a wheel event's vertical delta into CSS pixels.
 * `pagePx` is typically the scroll root's `clientHeight`.
 */
export function wheelDeltaPixels(
  e: { deltaY: number; deltaMode: number },
  linePx: number = WHEEL_LINE_PX,
  pagePx: number = 800,
): number {
  if (e.deltaMode === 1) return e.deltaY * linePx;
  if (e.deltaMode === 2) return e.deltaY * pagePx;
  return e.deltaY;
}

function scrollRootBy(root: ScrollRoot, dy: number) {
  if (!dy) return;
  if ('scrollBy' in root && typeof root.scrollBy === 'function') {
    root.scrollBy({ top: dy, left: 0, behavior: 'auto' });
    return;
  }
  (root as HTMLElement).scrollTop += dy;
}

/**
 * While a deck-builder card drag is active, auto-scroll near the scroll-root
 * edges, scrub scroll position over the scrollbar gutter, and forward wheel
 * deltas (browsers suppress default wheel scroll during HTML5 DnD).
 */
export function useDragAutoScroll() {
  useEffect(() => {
    let active = false;
    let rafId = 0;
    let lastX = 0;
    let lastY = 0;
    let hasPointer = false;

    function stopLoop() {
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
    }

    function tick() {
      rafId = 0;
      if (!active || !hasPointer) return;
      const root = resolveDeckBuilderScrollRoot();
      if (!root) return;

      if (isInVerticalScrollbarGutter(lastX, root as HTMLElement)) {
        const next = scrollbarTrackScrollTop(lastY, root as HTMLElement);
        if ((root as HTMLElement).scrollTop !== next) {
          (root as HTMLElement).scrollTop = next;
        }
      } else {
        const rect = root.getBoundingClientRect();
        const dy = edgeScrollDelta(lastY, rect);
        if (dy) scrollRootBy(root, dy);
      }

      rafId = requestAnimationFrame(tick);
    }

    function ensureLoop() {
      if (!rafId && active && hasPointer) {
        rafId = requestAnimationFrame(tick);
      }
    }

    function onDragStart(e: DragEvent) {
      if (!isDeckBuilderDragTypes(e.dataTransfer?.types)) return;
      active = true;
      hasPointer = false;
    }

    function onDragOver(e: DragEvent) {
      if (!active) return;
      if (!isDeckBuilderDragTypes(e.dataTransfer?.types)) return;
      lastX = e.clientX;
      lastY = e.clientY;
      hasPointer = true;

      const root = resolveDeckBuilderScrollRoot();
      if (root && isInVerticalScrollbarGutter(lastX, root as HTMLElement)) {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      }
      ensureLoop();
    }

    function onWheel(e: WheelEvent) {
      if (!active) return;
      const root = resolveDeckBuilderScrollRoot();
      if (!root) return;
      const dy = wheelDeltaPixels(e, WHEEL_LINE_PX, (root as HTMLElement).clientHeight || 800);
      if (!dy) return;
      e.preventDefault();
      scrollRootBy(root, dy);
    }

    function onDragEnd() {
      active = false;
      hasPointer = false;
      stopLoop();
    }

    document.addEventListener('dragstart', onDragStart);
    document.addEventListener('dragover', onDragOver);
    document.addEventListener('dragend', onDragEnd);
    document.addEventListener('drop', onDragEnd);
    document.addEventListener('wheel', onWheel, { capture: true, passive: false });
    return () => {
      document.removeEventListener('dragstart', onDragStart);
      document.removeEventListener('dragover', onDragOver);
      document.removeEventListener('dragend', onDragEnd);
      document.removeEventListener('drop', onDragEnd);
      document.removeEventListener('wheel', onWheel, { capture: true });
      stopLoop();
    };
  }, []);
}
