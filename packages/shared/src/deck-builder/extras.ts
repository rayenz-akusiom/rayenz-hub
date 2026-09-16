import type { CardInstance, DeckDocument } from '../schemas/deck-builder.js';
import { partitionCategories } from './browse.js';
import { collectionCardIsIgnored } from './collection.js';
import type { CardView } from './card-oracle.js';
import { resolveCardView } from './card-oracle.js';
import { scryfallImageFromId } from './scryfall-images.js';

export const EXTRAS_CATEGORY = 'Extras';
export const EXTRA_INSTANCE_PREFIX = '__extra__';

/** Minimal Scryfall related-card shape used for extras filtering. */
export type ExtrasRelatedPart = {
  id: string;
  component: string;
  name?: string;
  type_line?: string | null;
};

/** Display fields for a resolved extras card (token / emblem / dungeon). */
export type ExtrasDisplayCard = {
  scryfallId: string;
  name: string;
  typeLine: string | null;
  layout: string | null;
  setCode: string;
  collectorNumber: string;
};

const TOKEN_TYPE_RE = /\bToken\b/i;
const EMBLEM_TYPE_RE = /\bEmblem\b/i;
const DUNGEON_TYPE_RE = /\bDungeon\b/i;

/**
 * Keep tokens (by component or type line), emblems, and dungeons.
 * Drop self, meld parts/results, and other named combo pieces.
 */
export function isExtrasRelatedPart(
  part: ExtrasRelatedPart | null | undefined,
  selfId: string,
): boolean {
  if (!part?.id) return false;
  const id = String(part.id).trim();
  if (!id) return false;
  if (selfId && id.toLowerCase() === String(selfId).trim().toLowerCase()) return false;

  const component = String(part.component || '').toLowerCase();
  if (component === 'meld_part' || component === 'meld_result') return false;

  if (component === 'token') return true;

  const typeLine = String(part.type_line || '');
  if (TOKEN_TYPE_RE.test(typeLine)) return true;
  if (EMBLEM_TYPE_RE.test(typeLine)) return true;
  if (DUNGEON_TYPE_RE.test(typeLine)) return true;
  return false;
}

/** Unique related Scryfall ids from parent id → all_parts maps. */
export function collectExtrasRelatedIds(
  partsByCardId: ReadonlyMap<string, readonly ExtrasRelatedPart[]>,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const [selfId, parts] of partsByCardId) {
    for (const part of parts || []) {
      if (!isExtrasRelatedPart(part, selfId)) continue;
      const id = String(part.id).trim().toLowerCase();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(String(part.id).trim());
    }
  }
  return out;
}

/**
 * Main-deck source cards for commander/cube extras (header + included).
 * Excludes Maybeboard, Seeking, and Queued* aside categories.
 */
export function mainDeckSourceCards(
  deck: Pick<DeckDocument, 'cards' | 'categories'>,
): CardInstance[] {
  const { header, included, headerKeys, includedKeys } = partitionCategories(deck);
  const out: CardInstance[] = [];
  const seen = new Set<string>();
  for (const key of headerKeys) {
    for (const card of header[key] || []) {
      if (seen.has(card.instanceId)) continue;
      seen.add(card.instanceId);
      out.push(card);
    }
  }
  for (const key of includedKeys) {
    for (const card of included[key] || []) {
      if (seen.has(card.instanceId)) continue;
      seen.add(card.instanceId);
      out.push(card);
    }
  }
  return out;
}

/** Active binder cards for collection extras (excludes Won't collect). */
export function collectionBinderSourceCards(
  deck: Pick<DeckDocument, 'cards' | 'oracle'>,
): CardInstance[] {
  return (deck.cards || []).filter((c) => !collectionCardIsIgnored(c));
}

export function isExtrasSyntheticId(instanceId: string | null | undefined): boolean {
  return String(instanceId || '').startsWith(EXTRA_INSTANCE_PREFIX);
}

export function extrasCardView(display: ExtrasDisplayCard): CardView {
  const scryfallId = String(display.scryfallId || '').trim();
  const card: CardInstance = {
    instanceId: `${EXTRA_INSTANCE_PREFIX}${scryfallId}`,
    name: display.name || 'Unknown',
    quantity: 1,
    ownedQuantity: 0,
    inDeckQuantity: 0,
    primaryCategory: EXTRAS_CATEGORY,
    categories: [EXTRAS_CATEGORY],
    stack: null,
    setCode: display.setCode || null,
    collectorNumber: display.collectorNumber || null,
    scryfallId: scryfallId || null,
    archidektCardId: null,
    foil: false,
    proxy: false,
    collectionSource: 'manual',
    collectionIgnored: false,
  };
  return resolveCardView(card, {
    scryfallId: scryfallId || null,
    colourIdentity: [],
    colours: null,
    typeLine: display.typeLine ?? null,
    layout: display.layout ?? null,
    keywords: null,
    partnerWith: null,
    oracleText: null,
    printedName: null,
    flavorName: null,
    manaValue: null,
    imageUrl: scryfallImageFromId(scryfallId) || null,
    finishes: null,
    hasCommonPrinting: null,
    manaCost: null,
    producedMana: null,
    updatedAt: null,
  });
}

/** Sort extras by display name for stable UI order. */
export function sortExtrasDisplayCards(cards: readonly ExtrasDisplayCard[]): ExtrasDisplayCard[] {
  return [...cards].sort((a, b) =>
    String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }),
  );
}
