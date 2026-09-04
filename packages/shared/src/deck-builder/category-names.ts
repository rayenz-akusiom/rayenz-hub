/** Canonical Canadian spelling for the colourless identity / category. */
export const COLOURLESS_CATEGORY = 'Colourless';

/** Glance-only pad section for unassigned commander slots. Do not persist as a deck category. */
export const GLANCE_UNASSIGNED_CATEGORY = 'To be chosen';

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

export function isGlanceUnassignedCategoryName(name: string): boolean {
  return canonicalizeCategoryName(name).toLowerCase() === GLANCE_UNASSIGNED_CATEGORY.toLowerCase();
}
