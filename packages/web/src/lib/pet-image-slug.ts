export type ParsePetImageSlugOptions = {
  previousSlug?: string;
  nameChanged?: boolean;
};

/**
 * Extract a pet image slug from petlookup HTML.
 * Prefers the main /1/1.png portrait over the first /cp/ hit (often the active-pet chrome).
 * When the pet name changed, rejects a result that only matches the previous slug.
 */
export function parsePetImageSlug(
  html: string,
  options: ParsePetImageSlugOptions = {},
): string | null {
  const previousSlug = options.previousSlug ? String(options.previousSlug).trim() : '';
  const nameChanged = !!options.nameChanged;
  const text = String(html || '');
  const mainMatch = text.match(/pets\.neopets\.com\/cp\/([a-z0-9]+)\/1\/1\.png/i);
  if (mainMatch) {
    const mainSlug = mainMatch[1];
    if (nameChanged && previousSlug && mainSlug === previousSlug) {
      return null;
    }
    return mainSlug;
  }
  const found: string[] = [];
  const re = /pets\.neopets\.com\/cp\/([a-z0-9]+)\//gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (!found.includes(match[1])) {
      found.push(match[1]);
    }
  }
  if (found.length === 0) {
    return null;
  }
  if (nameChanged && previousSlug) {
    const distinct = found.find((slug) => slug !== previousSlug);
    return distinct || null;
  }
  return found[0];
}
