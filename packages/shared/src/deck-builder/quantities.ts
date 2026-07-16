import type { CardInstance, DeckFormat } from '../schemas/deck-builder.js';

const BASIC_LAND_NAMES = new Set([
  'plains',
  'island',
  'swamp',
  'mountain',
  'forest',
  'wastes',
  'snow-covered plains',
  'snow-covered island',
  'snow-covered swamp',
  'snow-covered mountain',
  'snow-covered forest',
]);

export function isBasicLand(card: Pick<CardInstance, 'name' | 'typeLine'>): boolean {
  if (card.typeLine && /Basic\s+Land/i.test(card.typeLine)) return true;
  const name = String(card.name || '')
    .trim()
    .toLowerCase()
    .replace(/\s*\(.*\)\s*$/, '');
  return BASIC_LAND_NAMES.has(name);
}

/**
 * Commander: keep quantity only on basic lands; expand other multi-qty into singleton instances.
 * Cube/other: leave quantities unchanged.
 */
export function normalizeCardQuantities(
  cards: CardInstance[],
  format: DeckFormat,
  nextId: (prefix: string) => string = (p) => `${p}-${Math.random().toString(36).slice(2, 9)}`,
): CardInstance[] {
  if (format !== 'commander') {
    return cards.map((c) => ({ ...c, quantity: Number(c.quantity) || 1, foil: Boolean(c.foil) }));
  }
  const out: CardInstance[] = [];
  for (const card of cards) {
    const qty = Math.max(1, Number(card.quantity) || 1);
    const foil = Boolean(card.foil);
    if (isBasicLand(card)) {
      out.push({ ...card, quantity: qty, foil });
      continue;
    }
    for (let i = 0; i < qty; i++) {
      out.push({
        ...card,
        instanceId: i === 0 ? card.instanceId : nextId('c'),
        quantity: 1,
        foil,
      });
    }
  }
  return out;
}
