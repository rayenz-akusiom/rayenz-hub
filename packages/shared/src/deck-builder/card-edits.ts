import type {
  CardInstance,
  CardOracle,
  CategoryDef,
  DeckDocument,
  FormalSwapEntry,
} from '../schemas/deck-builder.js';
import { isSwapQueueCategory, moveCardCategory } from './browse.js';
import { canonicalizeCategoryName } from './category-names.js';
import {
  isLookingForCategory,
  isSeekingCategory,
  isSwapQueueCategoryName,
  SEEKING,
} from '../mtg/swap-queue.js';
import { colourIdentitySection } from './colour-identity.js';
import {
  emptyCardOracle,
  getOracle,
  oracleKey,
  resolveCardView,
  resolveDeckCards,
  upsertOracle,
} from './card-oracle.js';
import { commanderTypeCategory } from './card-types.js';
import { collectCommanders } from './partner.js';
import {
  BASIC_LAND_TYPE_ORDER,
  basicLandDisplayName,
  basicLandTypeKey,
  isBasicLand,
  normalizeCardQuantities,
} from './quantities.js';
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
    (c) =>
      c.includedInDeck === false &&
      !isSwapQueueCategory(c.name) &&
      !isLookingForCategory(c.name),
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

/** Identity for merging basic-land printing stacks (matches formal-swap merge key). */
export function cardStackMergeKey(
  card: Pick<
    CardInstance,
    | 'name'
    | 'setCode'
    | 'collectorNumber'
    | 'scryfallId'
    | 'foil'
    | 'proxy'
    | 'primaryCategory'
    | 'stack'
  >,
): string {
  return [
    String(card.name || ''),
    String(card.setCode || ''),
    String(card.collectorNumber || ''),
    String(card.scryfallId || ''),
    card.foil ? '1' : '0',
    card.proxy ? '1' : '0',
    String(card.primaryCategory || ''),
    String(card.stack || ''),
  ].join('\0');
}

function isAsideBasicCategory(name: string | null | undefined): boolean {
  const n = String(name || '').trim();
  return isSwapQueueCategoryName(n) || isSeekingCategory(n);
}

/** Non-swap / non-seeking basic land stacks in the deck. */
export function listBasicLandStacks(
  deck: Pick<DeckDocument, 'cards'>,
): CardInstance[] {
  return (deck.cards || []).filter(
    (c) => isBasicLand(c) && !isAsideBasicCategory(c.primaryCategory),
  );
}

/**
 * Preferred category when adding a new basic stack:
 * majority among existing basics → Land def → defaultAddCategory.
 */
export function defaultBasicLandCategory(
  deck: Pick<DeckDocument, 'categories' | 'format' | 'cards'>,
  printing?: Pick<PrintingFields, 'name' | 'colourIdentity' | 'typeLine'> | null,
): string {
  const stacks = listBasicLandStacks(deck);
  if (stacks.length) {
    const counts = new Map<string, number>();
    for (const c of stacks) {
      const cat = String(c.primaryCategory || '').trim();
      if (!cat) continue;
      counts.set(cat, (counts.get(cat) || 0) + Math.max(1, Number(c.quantity) || 1));
    }
    let best = '';
    let bestN = -1;
    for (const [cat, n] of counts) {
      if (n > bestN) {
        best = cat;
        bestN = n;
      }
    }
    if (best) return best;
  }
  const landDef = (deck.categories || []).find(
    (c) => canonicalizeCategoryName(c.name) === 'Land',
  );
  if (landDef) return landDef.name;
  return defaultAddCategory(deck, printing);
}

/**
 * Set quantity on a card instance. Quantity ≤ 0 removes the card.
 * Commander non-basics are still normalized to qty 1 after update.
 */
export function setCardQuantity(
  deck: DeckDocument,
  instanceId: string,
  quantity: number,
  opts?: { nextId?: (prefix: string) => string },
): DeckDocument {
  const qty = Math.floor(Number(quantity));
  if (!Number.isFinite(qty) || qty <= 0) {
    return removeCardFromDeck(deck, instanceId);
  }
  const nextId = opts?.nextId || defaultNextId;
  const found = deck.cards.some((c) => c.instanceId === instanceId);
  if (!found) return deck;
  const cards = normalizeCardQuantities(
    deck.cards.map((c) =>
      c.instanceId === instanceId ? { ...c, quantity: qty } : c,
    ),
    deck.format,
    nextId,
  );
  return {
    ...deck,
    cards,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Add a basic printing stack, or bump quantity on an existing matching stack.
 */
export function addOrBumpBasicPrinting(
  deck: DeckDocument,
  printing: PrintingFields,
  opts?: {
    quantity?: number;
    category?: string;
    proxy?: boolean;
    nextId?: (prefix: string) => string;
  },
): DeckDocument {
  const addQty = Math.max(1, Math.floor(Number(opts?.quantity) || 1));
  const proxy = Boolean(opts?.proxy);
  const category =
    String(opts?.category || '').trim() || defaultBasicLandCategory(deck, printing);
  const probe: CardInstance = {
    instanceId: '__probe__',
    name: printing.name,
    quantity: 1,
    primaryCategory: category,
    categories: [category],
    stack: null,
    setCode: printing.setCode || null,
    collectorNumber: printing.collectorNumber || null,
    scryfallId: printing.scryfallId,
    archidektCardId: null,
    foil: Boolean(printing.foil),
    proxy,
  };
  const key = cardStackMergeKey(probe);
  const existing = listBasicLandStacks(deck).find((c) => cardStackMergeKey(c) === key);
  if (existing) {
    const current = Math.max(1, Number(existing.quantity) || 1);
    return setCardQuantity(deck, existing.instanceId, current + addQty, {
      nextId: opts?.nextId,
    });
  }
  return addCardToDeck(deck, printing, category, {
    quantity: addQty,
    proxy,
    nextId: opts?.nextId,
  });
}

/**
 * Change printing on a stack; if another stack shares the new identity, merge quantities.
 */
export function changeCardPrintingMerging(
  deck: DeckDocument,
  instanceId: string,
  printing: PrintingFields,
  opts?: { proxy?: boolean },
): DeckDocument {
  const before = deck.cards.find((c) => c.instanceId === instanceId);
  if (!before) return deck;
  let next = changeCardPrinting(deck, instanceId, printing, opts);
  const changed = next.cards.find((c) => c.instanceId === instanceId);
  if (!changed) return next;
  const key = cardStackMergeKey(changed);
  const other = next.cards.find(
    (c) =>
      c.instanceId !== instanceId &&
      !isAsideBasicCategory(c.primaryCategory) &&
      cardStackMergeKey(c) === key,
  );
  if (!other) return next;
  const mergedQty =
    Math.max(1, Number(other.quantity) || 1) + Math.max(1, Number(changed.quantity) || 1);
  next = setCardQuantity(next, other.instanceId, mergedQty);
  return removeCardFromDeck(next, instanceId);
}

const BASIC_CI_LETTER: Record<string, string | null> = {
  plains: 'W',
  island: 'U',
  swamp: 'B',
  mountain: 'R',
  forest: 'G',
  wastes: null,
  'snow-covered plains': 'W',
  'snow-covered island': 'U',
  'snow-covered swamp': 'B',
  'snow-covered mountain': 'R',
  'snow-covered forest': 'G',
};

/** Commander colour letters present on commanders (WUBRG order), empty if unknown. */
export function deckCommanderColourLetters(
  deck: Pick<DeckDocument, 'format' | 'cards' | 'oracle'>,
): string[] {
  if (deck.format !== 'commander') return [];
  const commanders = collectCommanders(resolveDeckCards(deck));
  const set = new Set<string>();
  for (const cmd of commanders) {
    for (const c of cmd.colourIdentity || []) {
      const letter = String(c).toUpperCase();
      if ('WUBRG'.includes(letter)) set.add(letter);
    }
  }
  return ['W', 'U', 'B', 'R', 'G'].filter((c) => set.has(c));
}

/**
 * Basic type display names to show in the Basics panel:
 * types already in the deck, plus CI-matching types (snow when CI known).
 */
export function basicLandTypesForPanel(
  deck: Pick<DeckDocument, 'format' | 'cards' | 'oracle'>,
): string[] {
  const present = new Set<string>();
  for (const c of listBasicLandStacks(deck)) {
    const key = basicLandTypeKey(c.name);
    if (key) present.add(basicLandDisplayName(key));
  }
  const letters = deckCommanderColourLetters(deck);
  const letterSet = new Set(letters);
  const commanders =
    deck.format === 'commander' ? collectCommanders(resolveDeckCards(deck)) : [];
  const colourlessKnown =
    deck.format === 'commander' &&
    letters.length === 0 &&
    commanders.some((c) => Boolean(c.scryfallId || c.typeLine));

  const out: string[] = [];
  for (const name of BASIC_LAND_TYPE_ORDER) {
    if (present.has(name)) {
      out.push(name);
      continue;
    }
    const key = name.toLowerCase();
    const ci = BASIC_CI_LETTER[key];
    if (ci == null) {
      if (colourlessKnown) out.push(name);
      continue;
    }
    if (letterSet.size > 0) {
      if (letterSet.has(ci)) out.push(name);
      continue;
    }
    // Unknown CI: offer core WUBRG only (not snow).
    if (!key.startsWith('snow-covered')) out.push(name);
  }
  return out;
}
