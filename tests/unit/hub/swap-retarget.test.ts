import { describe, expect, it } from 'vitest';
import {
  newFormalSwapEntry,
  syncCardsWithFormalSwaps,
} from '../../../packages/shared/src/deck-builder/formal-swaps.ts';
import { SEEKING, syncCardsWithLookingFor } from '../../../packages/shared/src/deck-builder/looking-for.ts';
import {
  retargetFormalSwap,
  retargetLookingFor,
  transplantCardInstance,
} from '../../../packages/shared/src/deck-builder/swap-retarget.ts';
import type { CardInstance, DeckDocument } from '../../../packages/shared/src/schemas/deck-builder.ts';

function card(partial: Partial<CardInstance> & Pick<CardInstance, 'instanceId' | 'name'>): CardInstance {
  return {
    quantity: 1,
    primaryCategory: 'Other',
    categories: ['Other'],
    stack: null,
    setCode: null,
    collectorNumber: null,
    scryfallId: null,
    archidektCardId: null,
    foil: false,
    proxy: false,
    ...partial,
  };
}

function baseDeck(over: Partial<DeckDocument> & Pick<DeckDocument, 'deckId' | 'name'>): DeckDocument {
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

describe('newFormalSwapEntry', () => {
  it('creates an empty pair at sortIndex', () => {
    const e = newFormalSwapEntry(3);
    expect(e.sortIndex).toBe(3);
    expect(e.inInstanceId).toBeNull();
    expect(e.outInstanceId).toBeNull();
    expect(e.id).toMatch(/^swap-/);
  });
});

describe('transplantCardInstance', () => {
  it('copies card + oracle and removes from source', () => {
    const from = baseDeck({
      deckId: 'a',
      name: 'A',
      cards: [card({ instanceId: 'c1', name: 'Sol Ring', scryfallId: 'sf-1' })],
      oracle: {
        'id:sf-1': {
          scryfallId: 'sf-1',
          colourIdentity: ['C'],
          colours: null,
          typeLine: 'Artifact',
          layout: 'normal',
          keywords: null,
          partnerWith: null,
          oracleText: null,
          printedName: null,
          flavorName: null,
          manaValue: 1,
          imageUrl: null,
          finishes: null,
          updatedAt: null,
        },
      },
    });
    const to = baseDeck({ deckId: 'b', name: 'B' });
    const result = transplantCardInstance(from, to, 'c1', 'Other', {
      nextId: () => 'c-new',
    });
    expect(result).not.toBeNull();
    expect(result!.from.cards).toHaveLength(0);
    expect(result!.to.cards).toHaveLength(1);
    expect(result!.newInstanceId).toBe('c-new');
    expect(result!.to.cards[0]!.name).toBe('Sol Ring');
    expect(result!.to.oracle['id:sf-1']?.typeLine).toBe('Artifact');
  });
});

describe('retargetFormalSwap', () => {
  it('moves In+Out pair, clears Out, and restores source Out category', () => {
    let source = baseDeck({
      deckId: 'a',
      name: 'A',
      cards: [
        card({ instanceId: 'in1', name: 'Sol Ring' }),
        card({ instanceId: 'out1', name: 'Cut Card' }),
      ],
      formalSwapEntries: [
        {
          id: 'swap1',
          inInstanceId: 'in1',
          outInstanceId: 'out1',
          inTargetCategory: 'Other',
          sortIndex: 0,
          notes: 'n',
        },
      ],
    });
    source = syncCardsWithFormalSwaps(source);
    expect(source.cards.find((c) => c.instanceId === 'out1')!.primaryCategory).toBe('Queued Out');

    const target = baseDeck({ deckId: 'b', name: 'B' });
    const result = retargetFormalSwap(source, target, 'swap1', undefined, {
      nextId: () => 'in-moved',
    });
    expect(result).not.toBeNull();
    expect(result!.source.formalSwapEntries).toHaveLength(0);
    expect(result!.source.cards.some((c) => c.instanceId === 'in1')).toBe(false);
    expect(result!.source.cards.find((c) => c.instanceId === 'out1')!.primaryCategory).toBe(
      'Other',
    );
    expect(result!.target.formalSwapEntries).toHaveLength(1);
    const entry = result!.target.formalSwapEntries[0]!;
    expect(entry.outInstanceId).toBeNull();
    expect(entry.inInstanceId).toBe('in-moved');
    expect(entry.notes).toBe('n');
    expect(result!.target.cards.some((c) => c.instanceId === 'in-moved')).toBe(true);
  });

  it('moves In-only and empty pairs', () => {
    const withIn = baseDeck({
      deckId: 'a',
      name: 'A',
      cards: [card({ instanceId: 'in1', name: 'Sol Ring' })],
      formalSwapEntries: [
        {
          id: 'swap-in',
          inInstanceId: 'in1',
          outInstanceId: null,
          inTargetCategory: 'Other',
          sortIndex: 0,
          notes: null,
        },
      ],
    });
    const empty = baseDeck({
      deckId: 'a2',
      name: 'A2',
      formalSwapEntries: [newFormalSwapEntry(0)],
    });
    empty.formalSwapEntries[0]!.id = 'swap-empty';

    const target = baseDeck({ deckId: 'b', name: 'B' });
    const movedIn = retargetFormalSwap(withIn, target, 'swap-in', undefined, {
      nextId: () => 'x',
    });
    expect(movedIn!.target.formalSwapEntries[0]!.inInstanceId).toBe('x');
    expect(movedIn!.target.formalSwapEntries[0]!.outInstanceId).toBeNull();

    const movedEmpty = retargetFormalSwap(empty, target, 'swap-empty');
    expect(movedEmpty!.target.formalSwapEntries.some((e) => e.id === 'swap-empty')).toBe(true);
    expect(movedEmpty!.target.formalSwapEntries.find((e) => e.id === 'swap-empty')!.inInstanceId).toBeNull();
  });

  it('reuses In already on target and drops leftover source In', () => {
    const source = baseDeck({
      deckId: 'a',
      name: 'A',
      cards: [
        card({ instanceId: 'old-in', name: 'Old In' }),
        card({ instanceId: 'out1', name: 'Out' }),
      ],
      formalSwapEntries: [
        {
          id: 'swap1',
          inInstanceId: 'old-in',
          outInstanceId: 'out1',
          inTargetCategory: 'Other',
          sortIndex: 0,
          notes: null,
        },
      ],
    });
    const target = baseDeck({
      deckId: 'b',
      name: 'B',
      cards: [card({ instanceId: 'new-in', name: 'New In' })],
    });
    const result = retargetFormalSwap(source, target, 'swap1', {
      inInstanceId: 'new-in',
      inTargetCategory: 'Other',
    });
    expect(result!.source.cards.some((c) => c.instanceId === 'old-in')).toBe(false);
    expect(result!.target.formalSwapEntries[0]!.inInstanceId).toBe('new-in');
    expect(result!.target.formalSwapEntries[0]!.outInstanceId).toBeNull();
  });
});

describe('retargetLookingFor', () => {
  it('moves Seeking card and entry to target', () => {
    let source = baseDeck({
      deckId: 'a',
      name: 'A',
      cards: [card({ instanceId: 'c1', name: 'Counterspell', primaryCategory: SEEKING, categories: [SEEKING] })],
      lookingForEntries: [{ id: 'lf1', instanceId: 'c1', sortIndex: 0, notes: 'want' }],
    });
    source = syncCardsWithLookingFor(source).deck;
    const target = baseDeck({ deckId: 'b', name: 'B' });
    const result = retargetLookingFor(source, target, 'lf1', { nextId: () => 'c-seek' });
    expect(result).not.toBeNull();
    expect(result!.source.lookingForEntries).toHaveLength(0);
    expect(result!.source.cards).toHaveLength(0);
    expect(result!.target.lookingForEntries).toEqual([
      { id: 'lf1', instanceId: 'c-seek', sortIndex: 0, notes: 'want' },
    ]);
    expect(result!.target.cards[0]!.primaryCategory).toBe(SEEKING);
  });
});
