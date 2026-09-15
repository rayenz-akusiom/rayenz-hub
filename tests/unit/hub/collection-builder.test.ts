import { describe, expect, it } from 'vitest';
import {
  COLLECTION_REPRESENTATIVE_INSTANCE_ID,
  collectionCardIsSought,
  collectionNeededQuantity,
  collectionSeekingToggleEnabled,
  defaultCollectionBrowseView,
  isCollectionRepresentativeCard,
  parsePlaneswalkerSubtype,
  syncCollectionDeck,
  toRepresentativeCardView,
  toggleCollectionCardsSeeking,
  type CardInstance,
  type DeckDocument,
} from '../../../packages/shared/src/index.ts';

function collectionCard(partial: Partial<CardInstance> & Pick<CardInstance, 'instanceId' | 'name'>): CardInstance {
  return {
    quantity: 1,
    ownedQuantity: 0,
    inDeckQuantity: 0,
    primaryCategory: 'Collection',
    categories: ['Collection'],
    stack: null,
    setCode: 'm10',
    collectorNumber: '60',
    scryfallId: partial.instanceId,
    archidektCardId: null,
    foil: false,
    proxy: false,
    collectionSource: 'search',
    ...partial,
  };
}

function collectionDoc(cards: CardInstance[], defaultQuantity = 1): DeckDocument {
  return {
    deckId: 'collection-1',
    schemaVersion: 2,
    name: 'Binder',
    description: '',
    format: 'collection',
    ownership: 'owned',
    visibility: 'private',
    archidektId: null,
    archidektUrl: null,
    categories: [],
    cards,
    oracle: {},
    formalSwapEntries: [],
    lookingForEntries: [],
    coverInstanceId: null,
    browseViewDefault: 'all_cards',
    cardLayoutDefault: 'grid',
    cardSortDefault: 'name_asc',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastArchidektSyncAt: null,
    lastArchidektImportAt: null,
    cubeTargetSize: null,
    collectionTemplate: 'planeswalkers',
    collectionSearch: {
      query: 't:planeswalker',
      defaultQuantity,
      lastSyncedAt: null,
      lastOpenedAt: null,
      latestReleaseDate: null,
      suppressedKeys: [],
    },
    representativeCard: null,
    autoAdjustBasics: false,
  };
}

describe('collection builder helpers', () => {
  it('marks unmet collection cards as sought', () => {
    expect(collectionNeededQuantity({ quantity: 3, ownedQuantity: 1 })).toBe(2);
    expect(collectionCardIsSought({ quantity: 3, ownedQuantity: 1 })).toBe(true);
    expect(collectionCardIsSought({ quantity: 2, ownedQuantity: 2 })).toBe(false);
  });

  it('treats the Binder representative as cover art, not inventory', () => {
    const view = toRepresentativeCardView({
      name: 'Jace Beleren',
      scryfallId: 'jace',
      setCode: 'm10',
      collectorNumber: '60',
      foil: true,
      imageUrl: null,
      printedName: null,
      flavorName: null,
    });
    expect(view.instanceId).toBe(COLLECTION_REPRESENTATIVE_INSTANCE_ID);
    expect(isCollectionRepresentativeCard(view)).toBe(true);
    expect(view.foil).toBe(false);
    expect(collectionCardIsSought(view)).toBe(false);
    expect(view.categories).not.toContain('Seeking');
  });

  it('uses planeswalker subtype browse as the template default', () => {
    expect(defaultCollectionBrowseView('planeswalkers')).toBe('planeswalker_subtype');
    expect(defaultCollectionBrowseView('partners')).toBe('partner_pairing');
    expect(defaultCollectionBrowseView('generic')).toBe('all_cards');
  });

  it('parses planeswalker subtypes from the oracle type line', () => {
    expect(parsePlaneswalkerSubtype('Legendary Planeswalker - Jace')).toBe('Jace');
    expect(parsePlaneswalkerSubtype('Legendary Creature - Human')).toBeNull();
    expect(parsePlaneswalkerSubtype(null)).toBeNull();
    expect(parsePlaneswalkerSubtype('')).toBeNull();
    expect(
      parsePlaneswalkerSubtype('Legendary Planeswalker — Oko // Legendary Planeswalker — Oko'),
    ).toBe('Oko');
    expect(
      parsePlaneswalkerSubtype('Legendary Creature — God // Legendary Planeswalker — Tibalt'),
    ).toBe('Tibalt');
    expect(
      parsePlaneswalkerSubtype(
        'Legendary Planeswalker — Will // Legendary Planeswalker — Rowan',
      ),
    ).toBe('Will & Rowan');
  });

  it('syncs collection cards into Seeking when owned is below target', () => {
    const doc: DeckDocument = {
      deckId: 'collection-1',
      schemaVersion: 2,
      name: 'Binder',
      description: '',
      format: 'collection',
      ownership: 'owned',
      visibility: 'private',
      archidektId: null,
      archidektUrl: null,
      categories: [],
      cards: [
        {
          instanceId: 'c1',
          name: 'Jace Beleren',
          quantity: 2,
          ownedQuantity: 1,
          inDeckQuantity: 3,
          primaryCategory: 'Collection',
          categories: ['Collection'],
          stack: null,
          setCode: 'm10',
          collectorNumber: '60',
          scryfallId: 'jace',
          archidektCardId: null,
          foil: false,
          proxy: false,
          collectionSource: 'search',
        },
      ],
      oracle: {},
      formalSwapEntries: [],
      lookingForEntries: [],
      coverInstanceId: null,
      browseViewDefault: 'all_cards',
      cardLayoutDefault: 'grid',
      cardSortDefault: 'name_asc',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastArchidektSyncAt: null,
      lastArchidektImportAt: null,
      cubeTargetSize: null,
      collectionTemplate: 'planeswalkers',
      collectionSearch: null,
      representativeCard: null,
      autoAdjustBasics: false,
    };
    const synced = syncCollectionDeck(doc);
    expect(synced.cards[0]?.inDeckQuantity).toBe(1);
    expect(synced.cards[0]?.categories).toContain('Seeking');
  });

  it('enables seeking toggle only when collection default target is 1', () => {
    expect(collectionSeekingToggleEnabled(collectionDoc([], 1))).toBe(true);
    expect(collectionSeekingToggleEnabled(collectionDoc([], 2))).toBe(false);
  });

  it('toggles collection seeking by filling or opening a one-copy gap', () => {
    const sought = collectionDoc([collectionCard({ instanceId: 'c1', name: 'Jace', quantity: 1, ownedQuantity: 0 })]);
    const owned = toggleCollectionCardsSeeking(sought, ['c1']);
    expect(owned.cards[0]?.ownedQuantity).toBe(1);
    expect(collectionCardIsSought(owned.cards[0]!)).toBe(false);
    expect(owned.cards[0]?.categories).not.toContain('Seeking');

    const back = toggleCollectionCardsSeeking(owned, ['c1']);
    expect(back.cards[0]?.ownedQuantity).toBe(0);
    expect(collectionCardIsSought(back.cards[0]!)).toBe(true);
  });

  it('marks all selected collection cards seeking when any is unmarked', () => {
    const doc = collectionDoc([
      collectionCard({ instanceId: 'a', name: 'Ajani', quantity: 1, ownedQuantity: 1 }),
      collectionCard({ instanceId: 'b', name: 'Jace', quantity: 1, ownedQuantity: 0 }),
    ]);
    const next = toggleCollectionCardsSeeking(doc, ['a', 'b']);
    expect(next.cards.map((card) => card.ownedQuantity)).toEqual([0, 0]);
  });

  it('does not wipe extra owned copies when toggling a higher target', () => {
    const complete = collectionDoc([
      collectionCard({ instanceId: 'c1', name: 'Jace', quantity: 3, ownedQuantity: 3 }),
    ]);
    const seeking = toggleCollectionCardsSeeking(complete, ['c1']);
    expect(seeking.cards[0]?.ownedQuantity).toBe(2);
    expect(collectionCardIsSought(seeking.cards[0]!)).toBe(true);

    const filled = toggleCollectionCardsSeeking(seeking, ['c1']);
    expect(filled.cards[0]?.ownedQuantity).toBe(3);
    expect(collectionCardIsSought(filled.cards[0]!)).toBe(false);
  });
});
