/** True when hover popouts are appropriate (mouse / fine pointer). */
export function canShowHoverPopout(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return true;
  }
  return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
}
