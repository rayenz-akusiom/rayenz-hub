import type { CardInstance, DeckDocument, DeckFormat } from '@rayenz-hub/shared';

/** Minimal CardInstance for unit/web tests. */
export function cardInstance(
  partial: Partial<CardInstance> & Pick<CardInstance, 'instanceId' | 'name'>,
): CardInstance {
  const primaryCategory = partial.primaryCategory ?? 'Other';
  const { categories: categoriesOverride, ...rest } = partial;
  return {
    quantity: 1,
    primaryCategory,
    stack: null,
    setCode: null,
    collectorNumber: null,
    scryfallId: null,
    archidektCardId: null,
    foil: false,
    proxy: false,
    ...rest,
    categories: categoriesOverride ?? [rest.primaryCategory ?? primaryCategory],
  };
}

/** Lean DeckDocument shell; override cards / entries as needed. */
export function leanDeck(
  over: Partial<DeckDocument> & Pick<DeckDocument, 'deckId' | 'name'>,
): DeckDocument {
  return {
    schemaVersion: 1,
    format: 'commander',
    archidektId: null,
    archidektUrl: null,
    categories: [{ name: 'Other', includedInDeck: true, includedInPrice: true, target: null }],
    cards: [],
    oracle: {},
    formalSwapEntries: [],
    lookingForEntries: [],
    coverInstanceId: null,
    browseViewDefault: null,
    cardLayoutDefault: 'stacked',
    cardSortDefault: 'name_asc',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    lastArchidektSyncAt: null,
    lastArchidektImportAt: null,
    cubeTargetSize: null,
    ...over,
  };
}

export function emptyLibraryDeck(
  deckId: string,
  name: string,
  format: DeckFormat = 'commander',
): DeckDocument {
  return leanDeck({ deckId, name, format, categories: [] });
}
