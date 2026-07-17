/**
 * Commander-style default category from a Scryfall type line.
 * Precedence (first match wins among card types present): Land > Creature >
 * Planeswalker > Battle > Instant > Sorcery > Artifact > Enchantment > Kindred.
 */

export const COMMANDER_TYPE_CATEGORY_PRECEDENCE = [
  { match: /\bLand\b/i, category: 'Land' },
  { match: /\bCreature\b/i, category: 'Creature' },
  { match: /\bPlaneswalker\b/i, category: 'Planeswalker' },
  { match: /\bBattle\b/i, category: 'Battle' },
  { match: /\bInstant\b/i, category: 'Instant' },
  { match: /\bSorcery\b/i, category: 'Sorcery' },
  { match: /\bArtifact\b/i, category: 'Artifact' },
  { match: /\bEnchantment\b/i, category: 'Enchantment' },
  { match: /\b(?:Kindred|Tribal)\b/i, category: 'Kindred' },
] as const;

/** Card-type portion of a type line (before the em dash / hyphen subtype). */
export function typeLineCardTypes(typeLine: string | null | undefined): string {
  const raw = String(typeLine || '').trim();
  if (!raw) return '';
  const cut = raw.split(/\s+[—–-]\s+/)[0] || raw;
  return cut.trim();
}

/**
 * Singular default category for Commander filing from type line.
 * Dual types follow precedence (e.g. Artifact Creature → Creature).
 */
export function commanderTypeCategory(typeLine: string | null | undefined): string {
  const types = typeLineCardTypes(typeLine);
  if (!types) return 'Other';
  for (const entry of COMMANDER_TYPE_CATEGORY_PRECEDENCE) {
    if (entry.match.test(types)) return entry.category;
  }
  return 'Other';
}
