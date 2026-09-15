import { describe, expect, it } from 'vitest';
import type { CardInstance, DeckDocument, DeckFormat, DeckOwnership } from '../../../packages/shared/src/index.ts';
import {
  applyCollectionDeckSync,
  collectDeckCopies,
  planCollectionDeckSync,
} from '../../../packages/web/src/deck-builder/collection/sync-from-decks.ts';

function card(over: Partial<CardInstance> & Pick<CardInstance, 'instanceId' | 'name'>): CardInstance {
  return {
    quantity: 1,
    ownedQuantity: 0,
    inDeckQuantity: 0,
    primaryCategory: 'Main',
    categories: ['Main'],
    stack: null,
    setCode: null,
    collectorNumber: null,
    scryfallId: null,
    archidektCardId: null,
    foil: false,
    proxy: false,
    collectionSource: 'search',
    ...over,
  };
}

function deck(over: Partial<DeckDocument> & Pick<DeckDocument, 'deckId' | 'name' | 'format'>): DeckDocument {
  const now = '2026-09-14T00:00:00.000Z';
  return {
    schemaVersion: 2,
    description: '',
    ownership: 'owned' as DeckOwnership,
    visibility: 'private',
    archidektId: null,
    archidektUrl: null,
    categories: [],
    cards: [],
    oracle: {},
    formalSwapEntries: [],
    lookingForEntries: [],
    coverInstanceId: null,
    browseViewDefault: 'all_cards',
    cardLayoutDefault: 'grid',
    cardSortDefault: 'name_asc',
    createdAt: now,
    updatedAt: now,
    lastArchidektSyncAt: null,
    lastArchidektImportAt: null,
    cubeTargetSize: null,
    collectionTemplate: null,
    collectionSearch: null,
    representativeCard: null,
    autoAdjustBasics: false,
    ...over,
  };
}

const binder = () =>
  deck({
    deckId: 'collection-1',
    name: 'Binder',
    format: 'collection',
    cards: [
      card({
        instanceId: 'c1',
        name: 'Jace Beleren',
        quantity: 1,
        primaryCategory: 'Collection',
        categories: ['Collection'],
        setCode: 'm11',
        collectorNumber: '1',
        scryfallId: 'jace-search',
      }),
    ],
  });

describe('collection sync from decks', () => {
  it('includes cube copies and skips theory, collections, and proxies', () => {
    const copies = collectDeckCopies(
      [
        deck({
          deckId: 'cube-1',
          name: 'Cube',
          format: 'cube',
          cards: [
            card({
              instanceId: 'u1',
              name: 'Jace Beleren',
              setCode: 'lrw',
              collectorNumber: '71',
              scryfallId: 'jace-cube',
            }),
          ],
        }),
        deck({
          deckId: 'cmd-1',
          name: 'Command',
          format: 'commander',
          cards: [
            card({
              instanceId: 'p1',
              name: 'Jace Beleren',
              proxy: true,
              setCode: 'm10',
              collectorNumber: '60',
              scryfallId: 'jace-proxy',
            }),
          ],
        }),
        deck({
          deckId: 'theory-1',
          name: 'Theory',
          format: 'commander',
          ownership: 'theory',
          cards: [
            card({
              instanceId: 't1',
              name: 'Jace Beleren',
              setCode: 'war',
              collectorNumber: '54',
              scryfallId: 'jace-theory',
            }),
          ],
        }),
        deck({
          deckId: 'collection-2',
          name: 'Other binder',
          format: 'collection' as DeckFormat,
          cards: [
            card({
              instanceId: 'b1',
              name: 'Jace Beleren',
              setCode: 'm10',
              collectorNumber: '60',
              scryfallId: 'jace-binder',
            }),
          ],
        }),
      ],
      { skipDeckIds: ['collection-1'] },
    );
    expect(copies.map((c) => c.scryfallId)).toEqual(['jace-cube']);
  });

  it('rewrites printing and marks collected when a matching cube copy exists', () => {
    const copies = collectDeckCopies([
      deck({
        deckId: 'cube-1',
        name: 'Cube',
        format: 'cube',
        cards: [
          card({
            instanceId: 'u1',
            name: 'Jace Beleren',
            setCode: 'lrw',
            collectorNumber: '71',
            scryfallId: 'jace-cube',
            foil: true,
          }),
        ],
      }),
    ]);
    const plan = planCollectionDeckSync(binder(), copies);
    expect(plan.conflicts).toHaveLength(0);
    const next = applyCollectionDeckSync(binder(), plan.autoCopies);
    expect(next.cards[0]?.ownedQuantity).toBe(1);
    expect(next.cards[0]?.inDeckQuantity).toBe(1);
    expect(next.cards[0]?.scryfallId).toBe('jace-cube');
    expect(next.cards[0]?.setCode).toBe('lrw');
    expect(next.cards[0]?.foil).toBe(true);
    expect(next.cards[0]?.categories).not.toContain('Seeking');
  });

  it('does not change already-owned rows', () => {
    const owned = deck({
      ...binder(),
      cards: [
        card({
          instanceId: 'c1',
          name: 'Jace Beleren',
          quantity: 1,
          ownedQuantity: 1,
          inDeckQuantity: 1,
          primaryCategory: 'Collection',
          categories: ['Collection'],
          setCode: 'm11',
          collectorNumber: '1',
          scryfallId: 'jace-search',
        }),
      ],
    });
    const copies = collectDeckCopies([
      deck({
        deckId: 'cube-1',
        name: 'Cube',
        format: 'cube',
        cards: [
          card({
            instanceId: 'u1',
            name: 'Jace Beleren',
            setCode: 'war',
            collectorNumber: '54',
            scryfallId: 'jace-war',
          }),
        ],
      }),
    ]);
    const plan = planCollectionDeckSync(owned, copies);
    expect(plan.autoCopies).toHaveLength(0);
    expect(plan.conflicts).toHaveLength(0);
    const next = applyCollectionDeckSync(owned, copies);
    expect(next.cards[0]?.scryfallId).toBe('jace-search');
    expect(next.cards[0]?.ownedQuantity).toBe(1);
  });

  it('conflicts when copies exceed remaining target', () => {
    const copies = collectDeckCopies([
      deck({
        deckId: 'a',
        name: 'A',
        format: 'commander',
        cards: [
          card({
            instanceId: 'a1',
            name: 'Jace Beleren',
            setCode: 'm10',
            collectorNumber: '60',
            scryfallId: 'jace-m10',
          }),
        ],
      }),
      deck({
        deckId: 'b',
        name: 'B',
        format: 'cube',
        cards: [
          card({
            instanceId: 'b1',
            name: 'Jace Beleren',
            setCode: 'war',
            collectorNumber: '54',
            scryfallId: 'jace-war',
          }),
        ],
      }),
    ]);
    const plan = planCollectionDeckSync(binder(), copies);
    expect(plan.autoCopies).toHaveLength(0);
    expect(plan.conflicts).toHaveLength(1);
    expect(plan.conflicts[0]?.needed).toBe(1);
    expect(plan.conflicts[0]?.copies).toHaveLength(2);

    const chosen = copies.filter((c) => c.scryfallId === 'jace-war');
    const next = applyCollectionDeckSync(binder(), chosen);
    expect(next.cards).toHaveLength(1);
    expect(next.cards[0]?.scryfallId).toBe('jace-war');
    expect(next.cards[0]?.ownedQuantity).toBe(1);
  });

  it('splits extra printings onto new rows when they fit the target', () => {
    const twoTarget = deck({
      ...binder(),
      cards: [
        card({
          instanceId: 'c1',
          name: 'Jace Beleren',
          quantity: 2,
          primaryCategory: 'Collection',
          categories: ['Collection'],
          setCode: 'm11',
          collectorNumber: '1',
          scryfallId: 'jace-search',
        }),
      ],
    });
    const copies = collectDeckCopies([
      deck({
        deckId: 'a',
        name: 'A',
        format: 'commander',
        cards: [
          card({
            instanceId: 'a1',
            name: 'Jace Beleren',
            setCode: 'm10',
            collectorNumber: '60',
            scryfallId: 'jace-m10',
          }),
        ],
      }),
      deck({
        deckId: 'b',
        name: 'B',
        format: 'cube',
        cards: [
          card({
            instanceId: 'b1',
            name: 'Jace Beleren',
            setCode: 'war',
            collectorNumber: '54',
            scryfallId: 'jace-war',
          }),
        ],
      }),
    ]);
    const plan = planCollectionDeckSync(twoTarget, copies);
    expect(plan.conflicts).toHaveLength(0);
    const next = applyCollectionDeckSync(twoTarget, plan.autoCopies);
    expect(next.cards).toHaveLength(2);
    const ids = next.cards.map((c) => c.scryfallId).sort();
    expect(ids).toEqual(['jace-m10', 'jace-war']);
    expect(next.cards.every((c) => c.ownedQuantity === 1)).toBe(true);
    expect(next.cards.some((c) => c.collectionSource === 'manual')).toBe(true);
    expect(next.cards.every((c) => !c.categories.includes('Seeking'))).toBe(true);
  });

  it('counts stacked quantity as multiple copies of the same printing', () => {
    const twoTarget = deck({
      ...binder(),
      cards: [
        card({
          instanceId: 'c1',
          name: 'Jace Beleren',
          quantity: 2,
          primaryCategory: 'Collection',
          categories: ['Collection'],
          setCode: 'm11',
          collectorNumber: '1',
          scryfallId: 'jace-search',
        }),
      ],
    });
    const copies = collectDeckCopies([
      deck({
        deckId: 'cube-1',
        name: 'Cube',
        format: 'cube',
        cards: [
          card({
            instanceId: 'u1',
            name: 'Jace Beleren',
            quantity: 2,
            setCode: 'lrw',
            collectorNumber: '71',
            scryfallId: 'jace-cube',
          }),
        ],
      }),
    ]);
    expect(copies).toHaveLength(2);
    const next = applyCollectionDeckSync(twoTarget, copies);
    expect(next.cards).toHaveLength(1);
    expect(next.cards[0]?.ownedQuantity).toBe(2);
    expect(next.cards[0]?.scryfallId).toBe('jace-cube');
  });
});
