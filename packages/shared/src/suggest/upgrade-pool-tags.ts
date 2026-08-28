import type { DeckProfile } from './types';

/** Printed keywords too broad for upgrade pool search or package themes. */
export const EVERGREEN_KEYWORDS = new Set([
  'flying',
  'haste',
  'trample',
  'vigilance',
  'lifelink',
  'deathtouch',
  'first strike',
  'double strike',
  'hexproof',
  'indestructible',
  'reach',
  'menace',
  'defender',
  'flash',
  'shroud',
  'ward',
  'prowess',
  'intimidate',
  'fear',
  'shadow',
  'horsemanship',
  'banding',
  'bushido',
  'flanking',
  'rampage',
  'cumulative upkeep',
  'phasing',
  'forecast',
  'landwalk',
  'islandwalk',
  'swampwalk',
  'mountainwalk',
  'forestwalk',
  'plainswalk',
  'protection',
  'regenerate',
  'withstand',
]);

const META_PACKAGE_KEYS = new Set(['keyword', 'theme', 'typal']);

export const UPGRADE_MIN_POOL_TARGET = 100;
export const UPGRADE_SEARCH_RAW_CAP = 1000;

function normalizeTagSlug(raw: string): string {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-');
}

export function isEvergreenKeyword(tag: string): boolean {
  const slug = normalizeTagSlug(tag);
  return EVERGREEN_KEYWORDS.has(slug) || EVERGREEN_KEYWORDS.has(slug.replace(/-/g, ' '));
}

export function filterEvergreenKeywords(interests: string[]): string[] {
  return interests.filter((t) => !isEvergreenKeyword(t));
}

function pushUniqueTag(out: string[], seen: Set<string>, raw: string): void {
  const slug = normalizeTagSlug(raw);
  if (!slug || seen.has(slug) || isEvergreenKeyword(slug)) return;
  seen.add(slug);
  out.push(slug);
}

/** Profile oracle tags for Scryfall otag search (roles first, then themes). */
export function collectProfileSearchTags(profile?: DeckProfile | null): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  (profile?.roles || []).forEach((role) => {
    (role.tags || []).forEach((t) => pushUniqueTag(out, seen, t));
  });
  [...(profile?.themes || []), ...(profile?.profile_tags || []), ...(profile?.tags || [])].forEach((t) =>
    pushUniqueTag(out, seen, t),
  );
  return out;
}

export function searchTagsKeySuffix(searchTags: string[]): string {
  if (!searchTags.length) return '';
  return ':tags-' + searchTags.slice().sort().join('+');
}

export function buildOtagClause(tags: string[]): string {
  const slugs = tags.map(normalizeTagSlug).filter(Boolean);
  if (!slugs.length) return '';
  if (slugs.length === 1) return `(otag:${slugs[0]})`;
  return `(${slugs.map((t) => `otag:${t}`).join(' OR ')})`;
}

export function isPackageThemeKey(key: string): boolean {
  const slug = normalizeTagSlug(key);
  if (!slug) return false;
  if (slug.startsWith('rule:')) return false;
  if (META_PACKAGE_KEYS.has(slug)) return false;
  if (isEvergreenKeyword(slug)) return false;
  return true;
}

export function nonEvergreenKeywordInterests(profile?: DeckProfile | null): string[] {
  return filterEvergreenKeywords(profile?.keyword_interests || []);
}
