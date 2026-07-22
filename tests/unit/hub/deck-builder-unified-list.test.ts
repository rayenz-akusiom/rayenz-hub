import { describe, it, expect } from 'vitest';
import { unifyDeckCardInstances } from '../../../packages/shared/src/mtg/wants-aggregate.ts';
import type { DeckDocument } from '../../../packages/shared/src/schemas/deck-builder.ts';

function card(instanceId: string, name: string, qty = 1): DeckDocument['cards'][number] {
  return {
    instanceId,
    name,
    quantity: qty,
    primaryCategory: 'Other',
    categories: ['Other'],
    stack: null,
    setCode: null,
    collectorNumber: null,
    scryfallId: null,
    archidektCardId: null,
    foil: false,
    proxy: false,
  };
}

function deck(
  partial: Partial<DeckDocument> & Pick<DeckDocument, 'deckId' | 'name' | 'format'>,
): DeckDocument {
  return {
    schemaVersion: 1,
    archidektId: null,
    archidektUrl: null,
    categories: [],
    cards: [],
    oracle: {},
    formalSwapEntries: [],
    lookingForEntries: [],
    coverInstanceId: null,
    browseViewDefault: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    lastArchidektSyncAt: null,
    lastArchidektImportAt: null,
    ...partial,
  };
}

describe('unifyDeckCardInstances', () => {
  it('groups duplicate instances by canonical name and sums quantities', () => {
    const d = deck({
      deckId: 'd1',
      name: 'Deck',
      format: 'commander',
      cards: [card('a', 'Sol Ring', 1), card('b', 'Sol Ring', 2), card('c', 'Counterspell', 1)],
    });
    const rows = unifyDeckCardInstances(d);
    expect(rows).toHaveLength(2);
    const solRing = rows.find((r) => r.displayName === 'Sol Ring')!;
    expect(solRing.totalQuantity).toBe(3);
    expect([...solRing.instanceIds].sort()).toEqual(['a', 'b']);
    const counterspell = rows.find((r) => r.displayName === 'Counterspell')!;
    expect(counterspell.totalQuantity).toBe(1);
    expect(counterspell.instanceIds).toEqual(['c']);
  });

  it('returns an empty list for a deck with no cards', () => {
    const d = deck({ deckId: 'd2', name: 'Empty', format: 'cube', cards: [] });
    expect(unifyDeckCardInstances(d)).toEqual([]);
  });

  it('uses printing-sought display name while merging on canonical oracle name', () => {
    const d = deck({
      deckId: 'd3',
      name: 'UB',
      format: 'commander',
      cards: [card('a1', 'Mind Flayer'), card('b1', 'Mind Flayer')],
      oracle: {
        'name:mind flayer': {
          scryfallId: null,
          colourIdentity: [],
          typeLine: null,
          layout: null,
          keywords: null,
          partnerWith: null,
          oracleText: null,
          printedName: 'The Arvinox, the Mind Flayer',
          flavorName: null,
          manaValue: null,
          imageUrl: null,
          finishes: null,
          updatedAt: null,
        },
      },
    });
    const rows = unifyDeckCardInstances(d);
    expect(rows).toHaveLength(1);
    expect(rows[0].displayName).toBe('The Arvinox, the Mind Flayer');
    expect(rows[0].totalQuantity).toBe(2);
    expect(rows[0].instanceIds).toHaveLength(2);
  });

  it('sorts rows by display name', () => {
    const d = deck({
      deckId: 'd4',
      name: 'Deck',
      format: 'commander',
      cards: [card('z', 'Zombie'), card('a', 'Angel')],
    });
    const rows = unifyDeckCardInstances(d);
    expect(rows.map((r) => r.displayName)).toEqual(['Angel', 'Zombie']);
  });
});
