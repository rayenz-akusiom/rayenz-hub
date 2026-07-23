import type {
  CardInstance,
  CardOracle,
  CategoryDef,
  DeckDocument,
  FormalSwapEntry,
} from '../schemas/deck-builder.js';
import { isSwapQueueCategory, moveCardCategory } from './browse.js';
import { canonicalizeCategoryName } from './category-names.js';
import { isLookingForCategory, SEEKING } from '../mtg/swap-queue.js';
import { colourIdentitySection } from './colour-identity.js';
import {
  emptyCardOracle,
  getOracle,
  oracleKey,
  resolveCardView,
  upsertOracle,
} from './card-oracle.js';
import { commanderTypeCategory } from './card-types.js';
import { normalizeCardQuantities } from './quantities.js';
import type { PrintingFields } from './scryfall-api.js';
import { applyPrintingToCard } from './scryfall-api.js';
import { scryfallImageFromId } from './scryfall-images.js';
import { reconcileLookingForFromCards } from './looking-for.js';

function defaultNextId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Default primary category when adding a card.
 * Cubes: colour-identity section. Lands are the only auto-filing exception that
 * ignores colour identity (→ Lands via separateLands); all other cards file by CI.
 * Commander/other: Maybeboard, else first aside, else Other.
 */
export function defaultAddCategory(
  deck: Pick<DeckDocument, 'categories' | 'format'>,
  printing?: Pick<PrintingFields, 'name' | 'colourIdentity' | 'typeLine'> | null,
): string {
  if (deck.format === 'cube' && printing) {
    // Lands → Lands (ignores CI); everything else → CI section name.
    return colourIdentitySection(
      {
        name: printing.name,
        colourIdentity: printing.colourIdentity,
        typeLine: printing.typeLine,
      },
      { separateLands: true },
    );
  }
  const cats = deck.categories || [];
  if (cats.some((c) => c.name === 'Maybeboard')) return 'Maybeboard';
  const aside = cats.find(
    (c) => c.includedInDeck === false && !isSwapQueueCategory(c.name),
  );
  if (aside) return aside.name;
  return 'Other';
}

/**
 * Default primary category for filing an existing card (mass “Move to default”).
 * Cube: CI section; Lands override identity.
 * Commander/other: first card type by precedence (Land > Creature > …).
 */
export function defaultCategoryForCard(
  deck: Pick<DeckDocument, 'format' | 'oracle'>,
  card: Pick<CardInstance, 'name' | 'scryfallId' | 'setCode' | 'collectorNumber'> & {
    colourIdentity?: string[] | null;
    typeLine?: string | null;
  },
): string {
  const oracle = getOracle(deck, card);
  const view = resolveCardView(card as CardInstance, oracle);
  const typeLine = card.typeLine ?? view.typeLine ?? null;
  const colourIdentity =
    (card.colourIdentity?.length ? card.colourIdentity : null) ||
    (view.colourIdentity?.length ? view.colourIdentity : []) ||
    [];

  if (deck.format === 'cube') {
    return colourIdentitySection(
      {
        name: card.name,
        colourIdentity,
        typeLine,
      },
      { separateLands: true },
    );
  }
  return commanderTypeCategory(typeLine);
}

/** Move selected cards to each card’s default category; ensures category defs. */
export function moveCardsToDefaultCategories(
  deck: DeckDocument,
  instanceIds: string[],
): DeckDocument {
  const idSet = new Set(instanceIds.filter(Boolean));
  if (!idSet.size) return deck;
  let cards = deck.cards;
  let categories = deck.categories || [];
  for (const card of deck.cards) {
    if (!idSet.has(card.instanceId)) continue;
    const target = defaultCategoryForCard(deck, card);
    cards = moveCardCategory(cards, card.instanceId, target, card.stack);
    categories = ensureCategoryDef(categories, target);
  }
  return {
    ...deck,
    cards,
    categories,
    updatedAt: new Date().toISOString(),
  };
}

/** Category names available for add / move, including common fallbacks. */
export function deckCategoryOptions(deck: Pick<DeckDocument, 'categories' | 'cards'>): string[] {
  const names = new Set<string>();
  for (const c of deck.categories || []) names.add(c.name);
  for (const card of deck.cards || []) {
    if (card.primaryCategory) names.add(card.primaryCategory);
  }
  names.add('Maybeboard');
  names.add(SEEKING);
  names.add('Other');
  return [...names].sort((a, b) => a.localeCompare(b));
}

export const PROXIES_CATEGORY = 'Proxies';

/** Ensure a named category exists on the deck (Maybeboard aside; Proxies no price). */
export function ensureCategoryDef(
  categories: CategoryDef[],
  name: string,
): CategoryDef[] {
  const canonical = canonicalizeCategoryName(name);
  if (!canonical) return categories;
  if (categories.some((c) => canonicalizeCategoryName(c.name) === canonical)) {
    return categories;
  }
  const aside =
    canonical === 'Maybeboard' || isSwapQueueCategory(canonical) || isLookingForCategory(canonical);
  const proxies = canonical === PROXIES_CATEGORY;
  return [
    ...categories,
    {
      name: canonical,
      includedInDeck: !aside,
      includedInPrice: aside || proxies ? false : true,
      target: null,
    },
  ];
}

/** Ensure deck-level Proxies category exists (Archidekt: typically excluded from price). */
export function ensureProxiesCategoryDef(categories: CategoryDef[]): CategoryDef[] {
  return ensureCategoryDef(categories, PROXIES_CATEGORY);
}

/**
 * Lift Archidekt "Proxies" off categories into the first-class proxy flag.
 * If primary was solely Proxies, fall back to the next category or Other.
 */
export function liftProxiesCategory(input: {
  primaryCategory: string;
  categories: string[];
}): { proxy: boolean; primaryCategory: string; categories: string[] } {
  const cats = [...new Set((input.categories || []).map((c) => String(c || '').trim()).filter(Boolean))];
  const proxy = cats.includes(PROXIES_CATEGORY) || input.primaryCategory === PROXIES_CATEGORY;
  const without = cats.filter((c) => c !== PROXIES_CATEGORY);
  let primary = input.primaryCategory === PROXIES_CATEGORY ? '' : input.primaryCategory;
  if (!primary || primary === PROXIES_CATEGORY) {
    primary = without[0] || 'Other';
  }
  if (!without.includes(primary)) {
    without.unshift(primary);
  }
  return { proxy, primaryCategory: primary, categories: [...new Set(without)] };
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

export function oracleFromPrinting(printing: PrintingFields): CardOracle {
  return emptyCardOracle({
    scryfallId: printing.scryfallId || null,
    colourIdentity: printing.colourIdentity || [],
    typeLine: printing.typeLine,
    layout: printing.layout ?? 'normal',
    keywords: null,
    partnerWith: null,
    oracleText: null,
    printedName: printing.printedName ?? null,
    flavorName: printing.flavorName ?? null,
    manaValue: printing.manaValue ?? null,
    imageUrl: printing.scryfallId ? scryfallImageFromId(printing.scryfallId) : null,
    finishes: printing.finishes?.length ? [...printing.finishes] : null,
    updatedAt: new Date().toISOString(),
  });
}

/** Toggle foil on a card instance when the printing supports it. */
export function setCardFoil(
  deck: DeckDocument,
  instanceId: string,
  foil: boolean,
): DeckDocument {
  return setCardsFoil(deck, [instanceId], foil);
}

/** Set foil on many instances (skips enabling when printing has no foil finish). */
export function setCardsFoil(
  deck: DeckDocument,
  instanceIds: string[],
  foil: boolean,
): DeckDocument {
  const idSet = new Set(instanceIds.filter(Boolean));
  if (!idSet.size) return deck;
  let changed = false;
  const cards = deck.cards.map((c) => {
    if (!idSet.has(c.instanceId)) return c;
    if (foil && !cardSupportsFoilToggle(deck, c)) return c;
    if (Boolean(c.foil) === Boolean(foil)) return c;
    changed = true;
    return { ...c, foil: Boolean(foil) };
  });
  if (!changed) return deck;
  return {
    ...deck,
    cards,
    updatedAt: new Date().toISOString(),
  };
}

/** Whether foil can be enabled for this card given stored oracle finishes. */
export function cardSupportsFoilToggle(
  deck: Pick<DeckDocument, 'oracle'>,
  card: Pick<CardInstance, 'scryfallId' | 'setCode' | 'collectorNumber' | 'name'>,
): boolean {
  const oracle = getOracle(deck, card);
  return Boolean(oracle?.finishes?.includes('foil'));
}

/** Toggle proxy on a card instance; ensures Proxies category def when enabling. */
export function setCardProxy(
  deck: DeckDocument,
  instanceId: string,
  proxy: boolean,
): DeckDocument {
  return setCardsProxy(deck, [instanceId], proxy);
}

/** Set proxy on many instances; ensures Proxies category when enabling any. */
export function setCardsProxy(
  deck: DeckDocument,
  instanceIds: string[],
  proxy: boolean,
): DeckDocument {
  const idSet = new Set(instanceIds.filter(Boolean));
  if (!idSet.size) return deck;
  let changed = false;
  const cards = deck.cards.map((c) => {
    if (!idSet.has(c.instanceId)) return c;
    if (Boolean(c.proxy) === Boolean(proxy)) return c;
    changed = true;
    return { ...c, proxy: Boolean(proxy) };
  });
  if (!changed) return deck;
  return {
    ...deck,
    cards,
    categories: proxy ? ensureProxiesCategoryDef(deck.categories || []) : deck.categories,
    updatedAt: new Date().toISOString(),
  };
}

/** Remove many card instances from the deck. */
export function removeCardsFromDeck(
  deck: DeckDocument,
  instanceIds: string[],
): DeckDocument {
  const idSet = new Set(instanceIds.filter(Boolean));
  if (!idSet.size) return deck;
  let next: DeckDocument = deck;
  for (const id of idSet) {
    next = removeCardFromDeck(next, id);
  }
  return next;
}

/** Move many cards to the same primary category (+ optional stack). */
export function moveCardsCategory(
  deck: DeckDocument,
  instanceIds: string[],
  primaryCategory: string,
  stack: string | null = null,
): DeckDocument {
  const idSet = new Set(instanceIds.filter(Boolean));
  if (!idSet.size) return deck;
  let cards = deck.cards;
  for (const id of idSet) {
    cards = moveCardCategory(cards, id, primaryCategory, stack);
  }
  return reconcileLookingForFromCards({
    ...deck,
    cards,
    categories: ensureCategoryDef(deck.categories || [], primaryCategory),
    updatedAt: new Date().toISOString(),
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
    proxy?: boolean;
  },
): DeckDocument {
  const nextId = opts?.nextId || defaultNextId;
  const primaryCategory =
    String(category || '').trim() || defaultAddCategory(deck, printing);
  const quantity = Math.max(1, Number(opts?.quantity) || 1);
  const proxy = Boolean(opts?.proxy);
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
    archidektCardId: null,
    foil: printing.foil,
    proxy,
  };
  const cards = normalizeCardQuantities([...deck.cards, instance], deck.format, nextId);
  const key = oracleKey(instance);
  let categories = ensureCategoryDef(deck.categories || [], primaryCategory);
  if (proxy) categories = ensureProxiesCategoryDef(categories);
  return reconcileLookingForFromCards({
    ...deck,
    cards,
    oracle: upsertOracle(deck.oracle, key, oracleFromPrinting(printing)),
    categories,
    updatedAt: new Date().toISOString(),
  });
}

export function removeCardFromDeck(
  deck: DeckDocument,
  instanceId: string,
): DeckDocument {
  const next: DeckDocument = {
    ...deck,
    cards: deck.cards.filter((c) => c.instanceId !== instanceId),
    formalSwapEntries: scrubSwapRefs(deck.formalSwapEntries || [], instanceId),
    lookingForEntries: (deck.lookingForEntries || []).filter((e) => e.instanceId !== instanceId),
    coverInstanceId: deck.coverInstanceId === instanceId ? null : deck.coverInstanceId ?? null,
    updatedAt: new Date().toISOString(),
  };
  return reconcileLookingForFromCards(next);
}

export function changeCardPrinting(
  deck: DeckDocument,
  instanceId: string,
  printing: PrintingFields,
  opts?: { proxy?: boolean },
): DeckDocument {
  const cards = deck.cards.map((c) => {
    if (c.instanceId !== instanceId) return c;
    const next = applyPrintingToCard(c, printing);
    if (opts?.proxy === undefined) return next;
    return { ...next, proxy: Boolean(opts.proxy) };
  });
  const changed = cards.find((c) => c.instanceId === instanceId);
  const oracle = changed
    ? upsertOracle(deck.oracle, oracleKey(changed), oracleFromPrinting(printing))
    : deck.oracle;
  let categories = deck.categories || [];
  if (opts?.proxy) categories = ensureProxiesCategoryDef(categories);
  return {
    ...deck,
    cards,
    oracle,
    categories,
    updatedAt: new Date().toISOString(),
  };
}
