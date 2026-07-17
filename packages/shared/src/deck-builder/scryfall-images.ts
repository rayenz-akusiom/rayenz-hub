export type CardImageFace = 'front' | 'back';

/** Scryfall layouts that have a distinct back face (`?face=back`). */
export const DOUBLE_FACED_LAYOUTS = new Set([
  'transform',
  'modal_dfc',
  'double_faced_token',
  'art_series',
  'reversible_card',
]);

export function cardHasBackFace(layout: string | null | undefined): boolean {
  if (!layout) return false;
  return DOUBLE_FACED_LAYOUTS.has(String(layout).toLowerCase());
}

/**
 * Layout without a Scryfall round-trip: DFC-looking names/type lines get a
 * provisional dual-faced layout so flip UI works; everything else is normal.
 */
export function provisionalLayoutFromCard(
  name: string | null | undefined,
  typeLine: string | null | undefined,
): string {
  const haystack = `${name || ''} ${typeLine || ''}`;
  if (haystack.includes(' // ')) return 'transform';
  return 'normal';
}

function withFaceParam(url: string, face?: CardImageFace): string {
  if (face !== 'back') return url;
  return url.includes('?') ? `${url}&face=back` : `${url}?face=back`;
}

/**
 * Direct file CDN — not rate-limited (unlike api.scryfall.com image redirects).
 * Path: /normal/{front|back}/{id[0]}/{id[1]}/{id}.jpg
 */
export function scryfallImageFromId(
  scryfallId: string | null | undefined,
  face?: CardImageFace,
): string | null {
  const id = String(scryfallId || '').trim();
  if (!id || id.length < 2) return null;
  const side: CardImageFace = face === 'back' ? 'back' : 'front';
  return `https://cards.scryfall.io/normal/${side}/${id[0]}/${id[1]}/${id}.jpg`;
}

export function scryfallImageFromPrinting(
  setCode: string | null | undefined,
  collectorNumber: string | null | undefined,
  face?: CardImageFace,
): string | null {
  if (!setCode || collectorNumber == null || collectorNumber === '') return null;
  return withFaceParam(
    `https://api.scryfall.com/cards/${encodeURIComponent(String(setCode).toLowerCase())}/` +
      `${encodeURIComponent(String(collectorNumber))}?format=image&version=normal`,
    face,
  );
}

export function scryfallImageFromName(
  name: string | null | undefined,
  face?: CardImageFace,
): string | null {
  if (!name) return null;
  return withFaceParam(
    `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}&format=image&version=normal`,
    face,
  );
}

export function cardImageUrl(
  card: {
    imageUrl?: string | null;
    scryfallId?: string | null;
    setCode?: string | null;
    collectorNumber?: string | null;
    name: string;
  },
  face?: CardImageFace,
): string {
  // Prefer stored CDN URL for front face; back face still needs id/print derivation.
  if (face !== 'back' && card.imageUrl) return card.imageUrl;
  return (
    scryfallImageFromId(card.scryfallId, face) ||
    scryfallImageFromPrinting(card.setCode, card.collectorNumber, face) ||
    scryfallImageFromName(card.name, face) ||
    ''
  );
}
