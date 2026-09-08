import {
  COLLECTION_CARD_LIMIT,
  COLLECTION_DEFAULT_CATEGORY,
  addCardToDeck,
  collectionNeededQuantity,
  defaultCollectionBrowseView,
  isCollectionDeck,
  mapScryfallCardToPrinting,
  oracleKey,
  searchCards,
  searchCardsNextPage,
  syncCollectionDeck,
  scryfallImageFromId,
  type CollectionRepresentativeCard,
  type CollectionTemplate,
  type DeckDocument,
  type PrintingFields,
  type ScryfallCard,
} from '@rayenz-hub/shared';

function representativeFromPrinting(
  printing: PrintingFields,
): CollectionRepresentativeCard {
  return {
    name: printing.name,
    scryfallId: printing.scryfallId,
    setCode: printing.setCode,
    collectorNumber: printing.collectorNumber,
    foil: Boolean(printing.foil),
    imageUrl: printing.scryfallId ? scryfallImageFromId(printing.scryfallId) : null,
    printedName: printing.printedName ?? null,
    flavorName: printing.flavorName ?? null,
  };
}

function newestRelease(cards: ScryfallCard[]): string | null {
  return cards
    .map((card) => String(card.released_at || '').trim())
    .filter(Boolean)
    .sort()
    .at(-1) || null;
}

export async function runCollectionSearch(query: string): Promise<ScryfallCard[]> {
  const trimmed = query.trim();
  if (!trimmed) throw new Error('Enter a Scryfall search query.');
  const first = await searchCards(trimmed, 1);
  const results = [...first.data];
  let next = first.next_page;
  while (next && results.length < COLLECTION_CARD_LIMIT) {
    const page = await searchCardsNextPage(next);
    results.push(...page.data);
    next = page.next_page;
  }
  if (first.total_cards != null && first.total_cards > COLLECTION_CARD_LIMIT) {
    throw new Error(`Collection search is too large (${first.total_cards} cards). Limit is ${COLLECTION_CARD_LIMIT}.`);
  }
  if (results.length > COLLECTION_CARD_LIMIT) {
    throw new Error(`Collection search exceeded the ${COLLECTION_CARD_LIMIT}-card limit.`);
  }
  return results;
}

export async function createCollectionDocument(input: {
  name: string;
  query: string;
  defaultQuantity: number;
  template: CollectionTemplate;
}): Promise<DeckDocument> {
  const results = await runCollectionSearch(input.query);
  const now = new Date().toISOString();
  let doc: DeckDocument = {
    schemaVersion: 2,
    deckId: `collection-${Math.random().toString(36).slice(2, 10)}`,
    name: input.name.trim() || 'New Collection',
    description: '',
    format: 'collection',
    ownership: 'owned',
    visibility: 'private',
    archidektId: null,
    archidektUrl: null,
    categories: [{ name: COLLECTION_DEFAULT_CATEGORY, includedInDeck: true, includedInPrice: true, target: null }],
    cards: [],
    oracle: {},
    formalSwapEntries: [],
    lookingForEntries: [],
    coverInstanceId: null,
    browseViewDefault: defaultCollectionBrowseView(input.template),
    cardLayoutDefault: 'grid',
    cardSortDefault: 'name_asc',
    createdAt: now,
    updatedAt: now,
    lastArchidektSyncAt: null,
    lastArchidektImportAt: null,
    cubeTargetSize: null,
    collectionTemplate: input.template,
    collectionSearch: {
      query: input.query.trim(),
      defaultQuantity: Math.max(1, Math.floor(input.defaultQuantity || 1)),
      lastSyncedAt: now,
      lastOpenedAt: now,
      latestReleaseDate: newestRelease(results),
      suppressedKeys: [],
    },
    representativeCard: null,
    autoAdjustBasics: false,
  };
  for (const card of results) {
    const printing = mapScryfallCardToPrinting(card);
    doc = addCardToDeck(doc, printing, COLLECTION_DEFAULT_CATEGORY, {
      quantity: Math.max(1, Math.floor(input.defaultQuantity || 1)),
    });
    const added = doc.cards[doc.cards.length - 1];
    if (added) {
      added.ownedQuantity = 0;
      added.inDeckQuantity = 0;
      added.collectionSource = 'search';
    }
  }
  return syncCollectionDeck(doc);
}

export async function syncCollectionFromSearch(
  deck: DeckDocument,
  query?: string,
): Promise<DeckDocument> {
  if (!isCollectionDeck(deck)) return deck;
  const search = deck.collectionSearch;
  const nextQuery = (query ?? search?.query ?? '').trim();
  if (!nextQuery) return deck;
  const results = await runCollectionSearch(nextQuery);
  const matchedByKey = new Map(results.map((card) => [oracleKey({
    name: card.name,
    scryfallId: card.id,
    setCode: card.set,
    collectorNumber: card.collector_number,
  }), card] as const));
  const suppressed = new Set(search?.suppressedKeys || []);
  const cards = (deck.cards || []).filter((card) => {
    if (card.collectionSource !== 'search') return true;
    const key = oracleKey(card);
    if (matchedByKey.has(key)) return true;
    return (card.ownedQuantity || 0) > 0 || (card.inDeckQuantity || 0) > 0;
  });
  let next: DeckDocument = {
    ...deck,
    cards,
  };
  const existing = new Set(cards.map((card) => oracleKey(card)));
  for (const result of results) {
    const printing = mapScryfallCardToPrinting(result);
    const key = oracleKey({
      name: printing.name,
      scryfallId: printing.scryfallId,
      setCode: printing.setCode,
      collectorNumber: printing.collectorNumber,
    });
    if (existing.has(key) || suppressed.has(key)) continue;
    next = addCardToDeck(next, printing, COLLECTION_DEFAULT_CATEGORY, {
      quantity: search?.defaultQuantity || 1,
    });
    const added = next.cards[next.cards.length - 1];
    if (added) {
      added.ownedQuantity = 0;
      added.inDeckQuantity = 0;
      added.collectionSource = 'search';
    }
  }
  const now = new Date().toISOString();
  next = syncCollectionDeck({
    ...next,
    collectionSearch: {
      query: nextQuery,
      defaultQuantity: search?.defaultQuantity || 1,
      lastSyncedAt: now,
      lastOpenedAt: now,
      latestReleaseDate: newestRelease(results),
      suppressedKeys: [...suppressed],
    },
    browseViewDefault:
      next.browseViewDefault || defaultCollectionBrowseView(next.collectionTemplate),
    updatedAt: now,
  });
  return next;
}

export function suppressCollectionCard(
  deck: DeckDocument,
  instanceId: string,
): DeckDocument {
  if (!isCollectionDeck(deck)) return deck;
  const card = deck.cards.find((row) => row.instanceId === instanceId);
  if (!card) return deck;
  const key = oracleKey(card);
  const suppressed = new Set(deck.collectionSearch?.suppressedKeys || []);
  suppressed.add(key);
  return {
    ...deck,
    cards: deck.cards.filter((row) => row.instanceId !== instanceId),
    collectionSearch: deck.collectionSearch
      ? { ...deck.collectionSearch, suppressedKeys: [...suppressed] }
      : null,
    updatedAt: new Date().toISOString(),
  };
}

export function collectionSummaryText(deck: DeckDocument): string {
  const unique = deck.cards.length;
  const needed = deck.cards.reduce((sum, card) => sum + collectionNeededQuantity(card), 0);
  const owned = deck.cards.reduce((sum, card) => sum + Math.max(0, Number(card.ownedQuantity) || 0), 0);
  return `${unique} cards · ${needed} needed · ${owned} owned`;
}

export { representativeFromPrinting };
