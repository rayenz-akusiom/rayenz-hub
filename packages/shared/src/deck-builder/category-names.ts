/** Canonical Canadian spelling for the colourless identity / category. */
export const COLOURLESS_CATEGORY = 'Colourless';

/**
 * Normalize category display names used across Hub.
 * Maps Colorless/colorless/colourless → Colourless; trims whitespace.
 */
export function canonicalizeCategoryName(name: string): string {
  const trimmed = String(name || '').trim();
  if (!trimmed) return trimmed;
  if (trimmed.toLowerCase() === 'colorless' || trimmed.toLowerCase() === 'colourless') {
    return COLOURLESS_CATEGORY;
  }
  return trimmed;
}
