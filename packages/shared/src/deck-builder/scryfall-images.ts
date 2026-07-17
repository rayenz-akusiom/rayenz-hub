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

function withFaceParam(url: string, face?: CardImageFace): string {
  if (face !== 'back') return url;
  return url.includes('?') ? `${url}&face=back` : `${url}?face=back`;
}

export function scryfallImageFromId(
  scryfallId: string | null | undefined,
  face?: CardImageFace,
): string | null {
  if (!scryfallId) return null;
  return withFaceParam(
    `https://api.scryfall.com/cards/${scryfallId}?format=image&version=normal`,
    face,
  );
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
    scryfallId?: string | null;
    setCode?: string | null;
    collectorNumber?: string | null;
    name: string;
  },
  face?: CardImageFace,
): string {
  return (
    scryfallImageFromId(card.scryfallId, face) ||
    scryfallImageFromPrinting(card.setCode, card.collectorNumber, face) ||
    scryfallImageFromName(card.name, face) ||
    ''
  );
}
