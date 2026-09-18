import { useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';

export type ClampedMenuPosition = { left: number; top: number };

/**
 * Keep a fixed-position menu inside the viewport when there is room.
 * If the menu is larger than the viewport, pin to `margin` on that axis.
 */
export function clampFixedMenuPosition(
  x: number,
  y: number,
  width: number,
  height: number,
  viewportW: number,
  viewportH: number,
  margin = 8,
): ClampedMenuPosition {
  const maxLeft = Math.max(margin, viewportW - width - margin);
  const maxTop = Math.max(margin, viewportH - height - margin);
  return {
    left: Math.min(Math.max(x, margin), maxLeft),
    top: Math.min(Math.max(y, margin), maxTop),
  };
}

/**
 * Measure the menu after layout and clamp its fixed `left`/`top` into the viewport.
 * Pass deps that change menu size (e.g. expanded sub-forms, item counts).
 */
export function useClampedFixedMenuPosition(
  anchorX: number,
  anchorY: number,
  deps: unknown[] = [],
): {
  ref: RefObject<HTMLDivElement | null>;
  style: CSSProperties;
} {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<ClampedMenuPosition>({ left: anchorX, top: anchorY });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof window === 'undefined') {
      setPos({ left: anchorX, top: anchorY });
      return;
    }
    const { width, height } = el.getBoundingClientRect();
    setPos(
      clampFixedMenuPosition(
        anchorX,
        anchorY,
        width,
        height,
        window.innerWidth,
        window.innerHeight,
      ),
    );
    // Caller-owned size deps (spread intentionally).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deps is a caller-owned list
  }, [anchorX, anchorY, ...deps]);

  return { ref, style: { left: pos.left, top: pos.top } };
}
