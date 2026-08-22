import type { CardInstance, DeckFormat } from '../schemas/deck-builder.js';
import { isCommandZoneFormat } from './format.js';

/** Canonical display order for basic land types in the Basics panel. */
export const BASIC_LAND_TYPE_ORDER = [
  'Plains',
  'Island',
  'Swamp',
  'Mountain',
  'Forest',
  'Wastes',
  'Snow-Covered Plains',
  'Snow-Covered Island',
  'Snow-Covered Swamp',
  'Snow-Covered Mountain',
  'Snow-Covered Forest',
] as const;

export type BasicLandTypeName = (typeof BASIC_LAND_TYPE_ORDER)[number];

const BASIC_LAND_NAMES = new Set(
  BASIC_LAND_TYPE_ORDER.map((n) => n.toLowerCase()),
);

/** Normalize a card name to a basic-land type key, or null if not a known basic. */
export function basicLandTypeKey(name: string | null | undefined): string | null {
  const key = String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s*\(.*\)\s*$/, '');
  return BASIC_LAND_NAMES.has(key) ? key : null;
}

export function isBasicLand(card: { name: string; typeLine?: string | null }): boolean {
  if (card.typeLine && /Basic\s+Land/i.test(card.typeLine)) return true;
  return basicLandTypeKey(card.name) != null;
}

/** Canonical display name for a basic type key (e.g. "forest" → "Forest"). */
export function basicLandDisplayName(keyOrName: string): string {
  const key = basicLandTypeKey(keyOrName) || String(keyOrName || '').trim().toLowerCase();
  const found = BASIC_LAND_TYPE_ORDER.find((n) => n.toLowerCase() === key);
  return found || String(keyOrName || '').trim();
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
  if (!isCommandZoneFormat(format)) {
    return cards.map((c) => ({
      ...c,
      quantity: Number(c.quantity) || 1,
      foil: Boolean(c.foil),
      proxy: Boolean(c.proxy),
    }));
  }
  const out: CardInstance[] = [];
  for (const card of cards) {
    const qty = Math.max(1, Number(card.quantity) || 1);
    const foil = Boolean(card.foil);
    const proxy = Boolean(card.proxy);
    if (isBasicLand(card)) {
      out.push({ ...card, quantity: qty, foil, proxy });
      continue;
    }
    for (let i = 0; i < qty; i++) {
      out.push({
        ...card,
        instanceId: i === 0 ? card.instanceId : nextId('c'),
        quantity: 1,
        foil,
        proxy,
      });
    }
  }
  return out;
}

