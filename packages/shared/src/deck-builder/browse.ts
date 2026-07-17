import type { CardInstance, CategoryDef, DeckDocument } from '../schemas/deck-builder.js';
import { isSwapQueueCategoryName } from '../mtg/swap-queue.js';

export const HEADER_CATEGORIES = ['Commander', 'Lieutenants'] as const;

export function isSwapQueueCategory(name: string): boolean {
  return isSwapQueueCategoryName(name);
}

export function groupByCategory(cards: CardInstance[]): Record<string, CardInstance[]> {
  const groups: Record<string, CardInstance[]> = {};
  for (const card of cards) {
    const key = card.primaryCategory || 'Other';
    if (!groups[key]) groups[key] = [];
    groups[key].push(card);
  }
  return groups;
}

export function moveCardCategory(
  cards: CardInstance[],
  instanceId: string,
  primaryCategory: string,
  stack: string | null = null,
): CardInstance[] {
  return cards.map((c) => {
    if (c.instanceId !== instanceId) return c;
    const categories = [...new Set([primaryCategory, ...(c.categories || []).filter((x) => x !== c.primaryCategory)])];
    return { ...c, primaryCategory, categories, stack };
  });
}

function asCommander(card: CardInstance): CardInstance {
  if (card.primaryCategory === 'Commander') return card;
  return {
    ...card,
    primaryCategory: 'Commander',
    categories: [
      ...new Set([
        'Commander',
        ...(card.categories || []).filter((x) => x !== card.primaryCategory),
      ]),
    ],
  };
}

/**
 * Place (or reorder) a card into Commander slot 0 or 1.
 * Preserves non-commander card order; emits ordered commanders at the first
 * commander / incoming position in the deck list.
 */
export function placeCardInCommanderSlot(
  cards: CardInstance[],
  instanceId: string,
  slot: 0 | 1,
): CardInstance[] {
  const dropped = cards.find((c) => c.instanceId === instanceId);
  if (!dropped) return cards;

  const incoming = asCommander(dropped);
  const others = cards.filter(
    (c) => c.primaryCategory === 'Commander' && c.instanceId !== instanceId,
  );

  let ordered: CardInstance[];
  if (others.length === 0) {
    ordered = [incoming];
  } else if (others.length === 1) {
    ordered = slot === 0 ? [incoming, others[0]] : [others[0], incoming];
  } else {
    const pair = others.slice(0, 2);
    const rest = others.slice(2);
    const displaced = pair[slot];
    const kept = pair[1 - slot];
    const newPair = slot === 0 ? [incoming, kept] : [kept, incoming];
    ordered = [...newPair, displaced, ...rest];
  }

  const result: CardInstance[] = [];
  let inserted = false;
  for (const c of cards) {
    const isIncoming = c.instanceId === instanceId;
    const isCommander = c.primaryCategory === 'Commander';
    if (isIncoming || isCommander) {
      if (!inserted) {
        result.push(...ordered);
        inserted = true;
      }
      continue;
    }
    result.push(c);
  }
  if (!inserted) result.push(...ordered);
  return result;
}

export function categoryIncluded(categories: CategoryDef[], name: string): boolean {
  const def = (categories || []).find((c) => c.name === name);
  if (!def) return true;
  return def.includedInDeck !== false;
}

/** Sum of quantities for cards whose primary category is included in the deck (Archidekt deck size). */
export function deckSize(deck: Pick<DeckDocument, 'cards' | 'categories'>): number {
  return (deck.cards || []).reduce((sum, card) => {
    if (!categoryIncluded(deck.categories || [], card.primaryCategory || 'Other')) return sum;
    return sum + (Number(card.quantity) || 1);
  }, 0);
}

export function totalCardQuantity(cards: CardInstance[]): number {
  return (cards || []).reduce((sum, card) => sum + (Number(card.quantity) || 1), 0);
}

export function isHeaderCategory(name: string): boolean {
  return (HEADER_CATEGORIES as readonly string[]).includes(name);
}

/** Commander then Lieutenants, then remaining categories alphabetically. */
export function orderedCategoryKeys(groups: Record<string, CardInstance[]>): {
  header: string[];
  rest: string[];
} {
  const keys = Object.keys(groups);
  const header = (HEADER_CATEGORIES as readonly string[]).filter((k) => keys.includes(k));
  const rest = keys.filter((k) => !isHeaderCategory(k)).sort((a, b) => a.localeCompare(b));
  return { header, rest };
}

/**
 * Partition cards for browse: header categories, included main columns, excluded (aside).
 * Queued In / Out are omitted by default (shown only via the formal swap queue).
 * Pass `includeSwapCategories: true` to surface them in the aside (swap edit pick mode).
 */
export function partitionCategories(
  deck: Pick<DeckDocument, 'cards' | 'categories'>,
  opts?: { includeSwapCategories?: boolean },
): {
  header: Record<string, CardInstance[]>;
  included: Record<string, CardInstance[]>;
  excluded: Record<string, CardInstance[]>;
  headerKeys: string[];
  includedKeys: string[];
  excludedKeys: string[];
} {
  const groups = groupByCategory(deck.cards || []);
  const header: Record<string, CardInstance[]> = {};
  const included: Record<string, CardInstance[]> = {};
  const excluded: Record<string, CardInstance[]> = {};

  for (const [name, list] of Object.entries(groups)) {
    if (isSwapQueueCategory(name)) {
      if (opts?.includeSwapCategories) {
        excluded[name] = list;
      }
      continue;
    }
    if (isHeaderCategory(name)) {
      header[name] = list;
    } else if (categoryIncluded(deck.categories || [], name)) {
      included[name] = list;
    } else {
      excluded[name] = list;
    }
  }

  const headerKeys = (HEADER_CATEGORIES as readonly string[]).filter((k) => header[k]?.length);
  const includedKeys = Object.keys(included).sort((a, b) => a.localeCompare(b));
  const excludedKeys = Object.keys(excluded).sort((a, b) => a.localeCompare(b));

  return { header, included, excluded, headerKeys, includedKeys, excludedKeys };
}

