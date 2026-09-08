import { describe, expect, it } from 'vitest';
import {
  collectionCardIsSought,
  collectionNeededQuantity,
  defaultCollectionBrowseView,
  parsePlaneswalkerSubtype,
  syncCollectionDeck,
  type DeckDocument,
} from '../../../packages/shared/src/index.ts';

describe('collection builder helpers', () => {
  it('marks unmet collection cards as sought', () => {
    expect(collectionNeededQuantity({ quantity: 3, ownedQuantity: 1 })).toBe(2);
    expect(collectionCardIsSought({ quantity: 3, ownedQuantity: 1 })).toBe(true);
    expect(collectionCardIsSought({ quantity: 2, ownedQuantity: 2 })).toBe(false);
  });

  it('uses planeswalker subtype browse as the template default', () => {
    expect(defaultCollectionBrowseView('planeswalkers')).toBe('planeswalker_subtype');
    expect(defaultCollectionBrowseView('generic')).toBe('all_cards');
  });

  it('parses planeswalker subtypes from the oracle type line', () => {
    expect(parsePlaneswalkerSubtype('Legendary Planeswalker - Jace')).toBe('Jace');
    expect(parsePlaneswalkerSubtype('Legendary Creature - Human')).toBeNull();
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
});
