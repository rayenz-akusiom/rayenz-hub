import type {
  CardInstance,
  CardOracle,
  CategoryDef,
  DeckDocument,
  FormalSwapEntry,
} from '../schemas/deck-builder.js';
import { isSwapQueueCategory } from './browse.js';
import { canonicalizeCategoryName } from './category-names.js';
import { colourIdentitySection } from './colour-identity.js';
import {
  emptyCardOracle,
  getOracle,
  oracleKey,
  upsertOracle,
} from './card-oracle.js';
import { normalizeCardQuantities } from './quantities.js';
import type { PrintingFields } from './scryfall-api.js';
import { applyPrintingToCard } from './scryfall-api.js';
import { scryfallImageFromId } from './scryfall-images.js';

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
  const aside = canonical === 'Maybeboard';
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
  const card = deck.cards.find((c) => c.instanceId === instanceId);
  if (!card) return deck;
  if (foil && !cardSupportsFoilToggle(deck, card)) return deck;
  if (Boolean(card.foil) === Boolean(foil)) return deck;
  return {
    ...deck,
    cards: deck.cards.map((c) =>
      c.instanceId === instanceId ? { ...c, foil: Boolean(foil) } : c,
    ),
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
  const card = deck.cards.find((c) => c.instanceId === instanceId);
  if (!card) return deck;
  if (Boolean(card.proxy) === Boolean(proxy)) return deck;
  return {
    ...deck,
    cards: deck.cards.map((c) =>
      c.instanceId === instanceId ? { ...c, proxy: Boolean(proxy) } : c,
    ),
    categories: proxy ? ensureProxiesCategoryDef(deck.categories || []) : deck.categories,
    updatedAt: new Date().toISOString(),
  };
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
  return {
    ...deck,
    cards,
    oracle: upsertOracle(deck.oracle, key, oracleFromPrinting(printing)),
    categories,
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
    coverInstanceId: deck.coverInstanceId === instanceId ? null : deck.coverInstanceId ?? null,
    updatedAt: new Date().toISOString(),
  };
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
