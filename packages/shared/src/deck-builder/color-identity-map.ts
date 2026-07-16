/** Map Archidekt / Scryfall colour identity tokens to WUBRG letters. */
const NAME_TO_LETTER: Record<string, 'W' | 'U' | 'B' | 'R' | 'G'> = {
  w: 'W',
  u: 'U',
  b: 'B',
  r: 'R',
  g: 'G',
  white: 'W',
  blue: 'U',
  black: 'B',
  red: 'R',
  green: 'G',
};

export type ColourLetter = 'W' | 'U' | 'B' | 'R' | 'G';

export function mapColourIdentityToken(raw: unknown): ColourLetter | null {
  if (raw == null) return null;
  const key = String(raw).trim().toLowerCase();
  return NAME_TO_LETTER[key] || null;
}

export function normalizeColourIdentity(raw: unknown): ColourLetter[] {
  if (!Array.isArray(raw)) return [];
  const out: ColourLetter[] = [];
  const seen = new Set<ColourLetter>();
  for (const item of raw) {
    const letter = mapColourIdentityToken(item);
    if (letter && !seen.has(letter)) {
      seen.add(letter);
      out.push(letter);
    }
  }
  return out;
}
