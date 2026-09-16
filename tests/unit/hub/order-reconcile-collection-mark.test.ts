import { describe, expect, it } from 'vitest';
import type { CardInstance, DeckDocument, DeckOwnership } from '../../../packages/shared/src/index.ts';
import {
  applyCollectionPrintingReplaces,
  applyExactCollectionMarks,
  buildCollectionMarkPlan,
  copiesRemainingAfterHits,
} from '../../../packages/web/src/order-reconcile/collection-mark.ts';
import type { CardCopy } from '../../../packages/web/src/order-reconcile/types.ts';

function card(over: Partial<CardInstance> & Pick<CardInstance, 'instanceId' | 'name'>): CardInstance {
  return {
    quantity: 1,
    ownedQuantity: 0,
    inDeckQuantity: 0,
    primaryCategory: 'Collection',
    categories: ['Collection', 'Seeking'],
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

function deck(over: Partial<DeckDocument> & Pick<DeckDocument, 'deckId' | 'name'>): DeckDocument {
  const now = '2026-09-15T00:00:00.000Z';
  return {
    schemaVersion: 2,
    description: '',
    format: 'collection',
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

function copy(over: Partial<CardCopy> & Pick<CardCopy, 'copy_id' | 'card_name'>): CardCopy {
  return {
    acquired_id: over.copy_id,
    set_code: null,
    collector_number: null,
    finish: null,
    ...over,
  };
}

describe('collection-mark plan', () => {
  it('buckets exact vs replaceable by set and collector', () => {
    const binders = [
      deck({
        deckId: 'b1',
        name: 'Binder A',
        cards: [
          card({
            instanceId: 'a1',
            name: 'Sol Ring',
            setCode: 'cmm',
            collectorNumber: '1',
          }),
          card({
            instanceId: 'a2',
            name: 'Lightning Bolt',
            setCode: 'm21',
            collectorNumber: '1',
          }),
        ],
      }),
    ];
    const copies = [
      copy({ copy_id: 'c1', card_name: 'Sol Ring', set_code: 'cmm', collector_number: '1' }),
      copy({ copy_id: 'c2', card_name: 'Lightning Bolt', set_code: 'mh3', collector_number: '2' }),
      copy({ copy_id: 'c3', card_name: 'Counterspell' }),
    ];

    const plan = buildCollectionMarkPlan(copies, binders, 'consume');
    expect(plan.exact).toHaveLength(1);
    expect(plan.exact[0]?.cardName).toBe('Sol Ring');
    expect(plan.replaceable).toHaveLength(1);
    expect(plan.replaceable[0]?.cardName).toBe('Lightning Bolt');
    expect(plan.exactBumpCount).toBe(1);
  });

  it('broadcast marks every needing binder from one copy; consume fills one', () => {
    const binders = [
      deck({
        deckId: 'b1',
        name: 'Binder A',
        cards: [
          card({
            instanceId: 'a1',
            name: 'Jace Beleren',
            setCode: 'm11',
            collectorNumber: '1',
          }),
        ],
      }),
      deck({
        deckId: 'b2',
        name: 'Binder B',
        cards: [
          card({
            instanceId: 'b1',
            name: 'Jace Beleren',
            setCode: 'm11',
            collectorNumber: '1',
          }),
        ],
      }),
    ];
    const copies = [
      copy({ copy_id: 'c1', card_name: 'Jace Beleren', set_code: 'm11', collector_number: '1' }),
    ];

    const broadcast = buildCollectionMarkPlan(copies, binders, 'broadcast');
    expect(broadcast.exactBumpCount).toBe(2);
    expect(broadcast.exactRowCount).toBe(2);

    const consume = buildCollectionMarkPlan(copies, binders, 'consume');
    expect(consume.exactBumpCount).toBe(1);
    expect(consume.exactRowCount).toBe(1);
  });

  it('respects foil when acquired finish is known', () => {
    const binders = [
      deck({
        deckId: 'b1',
        name: 'Binder',
        cards: [
          card({
            instanceId: 'nf',
            name: 'Sol Ring',
            setCode: 'cmm',
            collectorNumber: '1',
            foil: false,
          }),
          card({
            instanceId: 'f',
            name: 'Sol Ring',
            setCode: 'cmm',
            collectorNumber: '1',
            foil: true,
            quantity: 1,
            ownedQuantity: 0,
          }),
        ],
      }),
    ];
    const copies = [
      copy({
        copy_id: 'c1',
        card_name: 'Sol Ring',
        set_code: 'cmm',
        collector_number: '1',
        finish: 'foil',
      }),
    ];
    const plan = buildCollectionMarkPlan(copies, binders, 'consume');
    expect(plan.exact).toHaveLength(1);
    expect(plan.exact[0]?.instanceId).toBe('f');
  });

  it('name-only acquired lines never enter exact', () => {
    const binders = [
      deck({
        deckId: 'b1',
        name: 'Binder',
        cards: [
          card({
            instanceId: 'a1',
            name: 'Sol Ring',
            setCode: 'cmm',
            collectorNumber: '1',
          }),
        ],
      }),
    ];
    const plan = buildCollectionMarkPlan(
      [copy({ copy_id: 'c1', card_name: 'Sol Ring' })],
      binders,
      'broadcast',
    );
    expect(plan.exact).toHaveLength(0);
    expect(plan.replaceable).toHaveLength(1);
  });
});

describe('collection-mark apply', () => {
  it('bumps ownedQuantity only and leaves inDeckQuantity unchanged', () => {
    const binders = [
      deck({
        deckId: 'b1',
        name: 'Binder',
        cards: [
          card({
            instanceId: 'a1',
            name: 'Sol Ring',
            setCode: 'cmm',
            collectorNumber: '1',
            ownedQuantity: 0,
            inDeckQuantity: 0,
          }),
        ],
      }),
    ];
    const plan = buildCollectionMarkPlan(
      [copy({ copy_id: 'c1', card_name: 'Sol Ring', set_code: 'cmm', collector_number: '1' })],
      binders,
      'broadcast',
    );
    const next = applyExactCollectionMarks(binders, plan.exact);
    expect(next[0]?.cards[0]?.ownedQuantity).toBe(1);
    expect(next[0]?.cards[0]?.inDeckQuantity).toBe(0);
    expect(next[0]?.cards[0]?.categories.includes('Seeking')).toBe(false);
  });

  it('broadcast apply marks both binders from one hit set', () => {
    const binders = [
      deck({
        deckId: 'b1',
        name: 'A',
        cards: [
          card({
            instanceId: 'a1',
            name: 'Sol Ring',
            setCode: 'cmm',
            collectorNumber: '1',
          }),
        ],
      }),
      deck({
        deckId: 'b2',
        name: 'B',
        cards: [
          card({
            instanceId: 'b1',
            name: 'Sol Ring',
            setCode: 'cmm',
            collectorNumber: '1',
          }),
        ],
      }),
    ];
    const plan = buildCollectionMarkPlan(
      [copy({ copy_id: 'c1', card_name: 'Sol Ring', set_code: 'cmm', collector_number: '1' })],
      binders,
      'broadcast',
    );
    const next = applyExactCollectionMarks(binders, plan.exact);
    expect(next[0]?.cards[0]?.ownedQuantity).toBe(1);
    expect(next[1]?.cards[0]?.ownedQuantity).toBe(1);
    expect(copiesRemainingAfterHits(
      [copy({ copy_id: 'c1', card_name: 'Sol Ring', set_code: 'cmm', collector_number: '1' })],
      plan.exact,
    )).toHaveLength(0);
  });

  it('replace apply updates printing and owned', () => {
    const binders = [
      deck({
        deckId: 'b1',
        name: 'Binder',
        cards: [
          card({
            instanceId: 'a1',
            name: 'Lightning Bolt',
            setCode: 'm21',
            collectorNumber: '1',
            scryfallId: 'old-id',
          }),
        ],
      }),
    ];
    const plan = buildCollectionMarkPlan(
      [copy({ copy_id: 'c1', card_name: 'Lightning Bolt', set_code: 'mh3', collector_number: '42' })],
      binders,
      'consume',
    );
    expect(plan.replaceable).toHaveLength(1);
    const next = applyCollectionPrintingReplaces(binders, plan.replaceable);
    expect(next[0]?.cards[0]?.ownedQuantity).toBe(1);
    expect(next[0]?.cards[0]?.inDeckQuantity).toBe(0);
    expect(String(next[0]?.cards[0]?.setCode || '').toLowerCase()).toBe('mh3');
    expect(String(next[0]?.cards[0]?.collectorNumber)).toBe('42');
  });
});
