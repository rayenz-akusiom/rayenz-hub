import type {
  CardInstance,
  CategoryDef,
  DeckDocument,
  FormalSwapEntry,
} from '../schemas/deck-builder.js';
import { isSwapQueueCategory } from './browse.js';
import { normalizeCardQuantities } from './quantities.js';
import type { PrintingFields } from './scryfall-api.js';
import { applyPrintingToCard } from './scryfall-api.js';

function defaultNextId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Prefer Maybeboard, else first excluded (aside) category, else Other. */
export function defaultAddCategory(deck: Pick<DeckDocument, 'categories'>): string {
  const cats = deck.categories || [];
  if (cats.some((c) => c.name === 'Maybeboard')) return 'Maybeboard';
  const aside = cats.find(
    (c) => c.includedInDeck === false && !isSwapQueueCategory(c.name),
  );
  if (aside) return aside.name;
  return 'Other';
}

/** Category names available for add / move, including common fallbacks. */
export function deckCategoryOptions(deck: Pick<DeckDocument, 'categories' | 'cards'>): string[] {
  const names = new Set<string>();
  for (const c of deck.categories || []) names.add(c.name);
  for (const card of deck.cards || []) {
    if (card.primaryCategory) names.add(card.primaryCategory);
  }
  names.add('Maybeboard');
  names.add('Other');
  return [...names].sort((a, b) => a.localeCompare(b));
}

function ensureCategoryDef(
  categories: CategoryDef[],
  name: string,
): CategoryDef[] {
  if (categories.some((c) => c.name === name)) return categories;
  const aside = name === 'Maybeboard';
  return [
    ...categories,
    {
      name,
      includedInDeck: !aside,
      includedInPrice: !aside,
    },
  ];
}

function scrubSwapRefs(
  entries: FormalSwapEntry[],
  instanceId: string,
): FormalSwapEntry[] {
  return entries.map((e) => {
    let next = e;
    if (e.inInstanceId === instanceId) {
      next = { ...next, inInstanceId: null };
    }
    if (e.outInstanceId === instanceId) {
      next = { ...next, outInstanceId: null };
    }
    return next;
  });
}

export function addCardToDeck(
  deck: DeckDocument,
  printing: PrintingFields,
  category: string,
  opts?: {
    quantity?: number;
    stack?: string | null;
    nextId?: (prefix: string) => string;
  },
): DeckDocument {
  const nextId = opts?.nextId || defaultNextId;
  const primaryCategory = String(category || '').trim() || defaultAddCategory(deck);
  const quantity = Math.max(1, Number(opts?.quantity) || 1);
  const instance: CardInstance = {
    instanceId: nextId('c'),
    name: printing.name,
    quantity,
    primaryCategory,
    categories: [primaryCategory],
    stack: opts?.stack ?? null,
    setCode: printing.setCode || null,
    collectorNumber: printing.collectorNumber || null,
    scryfallId: printing.scryfallId,
    colourIdentity: printing.colourIdentity,
    typeLine: printing.typeLine,
    archidektCardId: null,
    foil: printing.foil,
  };
  const cards = normalizeCardQuantities([...deck.cards, instance], deck.format, nextId);
  return {
    ...deck,
    cards,
    categories: ensureCategoryDef(deck.categories || [], primaryCategory),
    updatedAt: new Date().toISOString(),
  };
}

export function removeCardFromDeck(
  deck: DeckDocument,
  instanceId: string,
): DeckDocument {
  return {
    ...deck,
    cards: deck.cards.filter((c) => c.instanceId !== instanceId),
    formalSwapEntries: scrubSwapRefs(deck.formalSwapEntries || [], instanceId),
    updatedAt: new Date().toISOString(),
  };
}

export function changeCardPrinting(
  deck: DeckDocument,
  instanceId: string,
  printing: PrintingFields,
): DeckDocument {
  return {
    ...deck,
    cards: deck.cards.map((c) =>
      c.instanceId === instanceId ? applyPrintingToCard(c, printing) : c,
    ),
    updatedAt: new Date().toISOString(),
  };
}
