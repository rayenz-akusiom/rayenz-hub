export function scryfallImageFromId(scryfallId: string | null | undefined): string | null {
  if (!scryfallId) return null;
  return `https://api.scryfall.com/cards/${scryfallId}?format=image&version=normal`;
}

export function scryfallImageFromPrinting(
  setCode: string | null | undefined,
  collectorNumber: string | null | undefined,
): string | null {
  if (!setCode || collectorNumber == null || collectorNumber === '') return null;
  return (
    `https://api.scryfall.com/cards/${encodeURIComponent(String(setCode).toLowerCase())}/` +
    `${encodeURIComponent(String(collectorNumber))}?format=image&version=normal`
  );
}

export function scryfallImageFromName(name: string | null | undefined): string | null {
  if (!name) return null;
  return `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}&format=image&version=normal`;
}

export function cardImageUrl(card: {
  scryfallId?: string | null;
  setCode?: string | null;
  collectorNumber?: string | null;
  name: string;
}): string {
  return (
    scryfallImageFromId(card.scryfallId) ||
    scryfallImageFromPrinting(card.setCode, card.collectorNumber) ||
    scryfallImageFromName(card.name) ||
    ''
  );
}
