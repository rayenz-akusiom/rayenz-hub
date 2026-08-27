import { useCallback, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

export const LONG_PRESS_MS = 450;

export type LongPressPoint = { x: number; y: number };

/** Pointer long-press timer shared by browse tiles and Scryfall search results. */
export function useLongPress(delayMs = LONG_PRESS_MS) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firedRef = useRef(false);
  const posRef = useRef<LongPressPoint>({ x: 0, y: 0 });

  const clear = useCallback(() => {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const start = useCallback(
    (e: ReactPointerEvent, onFire: (pos: LongPressPoint) => void) => {
      // Ignore non-primary mouse buttons; touch/pen often omit `button`.
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      firedRef.current = false;
      posRef.current = {
        x: Number.isFinite(e.clientX) ? e.clientX : 0,
        y: Number.isFinite(e.clientY) ? e.clientY : 0,
      };
      clear();
      timerRef.current = setTimeout(() => {
        firedRef.current = true;
        timerRef.current = null;
        onFire(posRef.current);
      }, delayMs);
    },
    [clear, delayMs],
  );

  const consumeClick = useCallback(() => {
    if (firedRef.current) {
      firedRef.current = false;
      return true;
    }
    return false;
  }, []);

  return { start, end: clear, clear, consumeClick };
}
