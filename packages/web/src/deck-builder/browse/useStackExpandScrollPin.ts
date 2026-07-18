import { useEffect, useRef, type RefObject } from 'react';

/** Matches `.db-card-stack-item + .db-card-stack-item` margin transition (0.45s). */
export const STACK_EXPAND_COLLAPSE_MS = 500;

export type ScrollParent = { scrollTop: number };

/**
 * Adjust scroll parent so `el`'s viewport top stays at `pinnedTop`.
 * Returns the delta applied to `scrollTop` (0 if none).
 */
export function compensateScrollToPinnedTop(
  scrollParent: ScrollParent,
  el: { getBoundingClientRect: () => { top: number } },
  pinnedTop: number,
): number {
  const delta = el.getBoundingClientRect().top - pinnedTop;
  if (delta === 0) return 0;
  scrollParent.scrollTop += delta;
  return delta;
}

function resolveHubMain(): HTMLElement | null {
  return document.querySelector('.hub-main');
}

function closestStackItem(target: EventTarget | null, stack: HTMLElement): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  const item = target.closest('.db-card-stack-item');
  if (!item || !stack.contains(item)) return null;
  return item as HTMLElement;
}

/**
 * While a stack item is hovered/focused (and briefly after leave while margin
 * collapses), pin its viewport Y by compensating `.hub-main` scrollTop so the
 * CSS hover-expand does not jump the page.
 */
export function useStackExpandScrollPin(stackRef: RefObject<HTMLElement | null>): void {
  const pinnedElRef = useRef<HTMLElement | null>(null);
  const pinnedTopRef = useRef(0);
  const rafRef = useRef(0);
  const stopTimerRef = useRef(0);

  useEffect(() => {
    const stack = stackRef.current;
    if (!stack) return;

    const cancelRaf = () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
    };

    const tick = () => {
      const el = pinnedElRef.current;
      const main = resolveHubMain();
      if (!el || !main) {
        rafRef.current = 0;
        return;
      }
      compensateScrollToPinnedTop(main, el, pinnedTopRef.current);
      rafRef.current = requestAnimationFrame(tick);
    };

    const startPin = (el: HTMLElement) => {
      if (stopTimerRef.current) {
        window.clearTimeout(stopTimerRef.current);
        stopTimerRef.current = 0;
      }
      pinnedElRef.current = el;
      pinnedTopRef.current = el.getBoundingClientRect().top;
      cancelRaf();
      rafRef.current = requestAnimationFrame(tick);
    };

    const stopPinSoon = () => {
      if (stopTimerRef.current) window.clearTimeout(stopTimerRef.current);
      stopTimerRef.current = window.setTimeout(() => {
        stopTimerRef.current = 0;
        pinnedElRef.current = null;
        cancelRaf();
      }, STACK_EXPAND_COLLAPSE_MS);
    };

    const onPointerOver = (e: PointerEvent) => {
      const item = closestStackItem(e.target, stack);
      if (!item) return;
      if (pinnedElRef.current === item) return;
      startPin(item);
    };

    const onPointerOut = (e: PointerEvent) => {
      const related = e.relatedTarget;
      if (related instanceof Node && stack.contains(related)) {
        const next = closestStackItem(related, stack);
        if (next) {
          startPin(next);
          return;
        }
      }
      stopPinSoon();
    };

    const onFocusIn = (e: FocusEvent) => {
      const item = closestStackItem(e.target, stack);
      if (item) startPin(item);
    };

    const onFocusOut = (e: FocusEvent) => {
      const related = e.relatedTarget;
      if (related instanceof Node && stack.contains(related)) {
        const next = closestStackItem(related, stack);
        if (next) {
          startPin(next);
          return;
        }
      }
      stopPinSoon();
    };

    stack.addEventListener('pointerover', onPointerOver);
    stack.addEventListener('pointerout', onPointerOut);
    stack.addEventListener('focusin', onFocusIn);
    stack.addEventListener('focusout', onFocusOut);

    return () => {
      stack.removeEventListener('pointerover', onPointerOver);
      stack.removeEventListener('pointerout', onPointerOut);
      stack.removeEventListener('focusin', onFocusIn);
      stack.removeEventListener('focusout', onFocusOut);
      if (stopTimerRef.current) window.clearTimeout(stopTimerRef.current);
      cancelRaf();
      pinnedElRef.current = null;
    };
  }, [stackRef]);
}
