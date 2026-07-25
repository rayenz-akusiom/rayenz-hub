import { describe, it, expect } from 'vitest';
import {
  addCardsToSwapQueueAsOut,
  applyFormalSwapsToCards,
  formalSwapInIds,
  incompleteEntryCount,
  normalizeFormalEntries,
  queueCardsAsOut,
  seedFormalSwapsFromCategories,
  splitOutInstance,
  syncCardsWithFormalSwaps,
} from '../../../packages/shared/src/deck-builder/formal-swaps.ts';
import { deckSize } from '../../../packages/shared/src/deck-builder/browse.ts';
import type { CardInstance, DeckDocument } from '../../../packages/shared/src/schemas/deck-builder.ts';
import commander from '../../fixtures/deck-builder/commander-slice.json';

function plainsStackDeck(qty = 6): DeckDocument {
  const base = commander as unknown as DeckDocument;
  const plains: CardInstance = {
    instanceId: 'plains-stack',
    name: 'Plains',
    quantity: qty,
    primaryCategory: 'Land',
    categories: ['Land'],
    stack: null,
    setCode: 'm12',
    collectorNumber: '230',
    scryfallId: null,
    archidektCardId: null,
    foil: false,
    proxy: false,
  };
  return {
    ...base,
    cards: [...base.cards.map((c) => ({ ...c, foil: false, proxy: false })), plains],
  };
}

describe('formal swaps', () => {
  it('normalizes sortIndex and counts incomplete', () => {
    const entries = normalizeFormalEntries([
      { id: 'b', inInstanceId: 'c1', outInstanceId: null, sortIndex: 5, notes: null },
      { id: 'a', inInstanceId: null, outInstanceId: 'c2', sortIndex: 1, notes: null },
    ]);
    expect(entries[0].id).toBe('a');
    expect(entries[0].sortIndex).toBe(0);
    expect(incompleteEntryCount(entries)).toBe(2);
  });

  it('applies commander In/Out categories', () => {
    const cards = applyFormalSwapsToCards(
      commander.cards,
      [{ id: 's1', inInstanceId: 'c3', outInstanceId: 'c1', sortIndex: 0, notes: null }],
      'commander',
    );
    const byId = Object.fromEntries(cards.map((c) => [c.instanceId, c]));
    expect(byId.c3.primaryCategory).toBe('Queued In');
    expect(byId.c1.primaryCategory).toBe('Queued Out');
  });

  it('applies cube In/Out as primary Queued categories (not Maybeboard)', () => {
    const cards = applyFormalSwapsToCards(
      commander.cards,
      [{ id: 's1', inInstanceId: 'c3', outInstanceId: 'c1', sortIndex: 0, notes: null }],
      'cube',
    );
    const byId = Object.fromEntries(cards.map((c) => [c.instanceId, c]));
    expect(byId.c3.primaryCategory).toBe('Queued In');
    expect(byId.c1.primaryCategory).toBe('Queued Out');
    expect(byId.c3.categories).not.toContain('Maybeboard');
    expect(byId.c1.categories).not.toContain('Maybeboard');
  });

  it('seeds pairs from Queued In/Out and preserves existing', () => {
    const cards = [
      { ...commander.cards[0], instanceId: 'in1', primaryCategory: 'Queued In', categories: ['Queued In'] },
      { ...commander.cards[1], instanceId: 'out1', primaryCategory: 'Queued Out', categories: ['Queued Out'] },
      { ...commander.cards[2], instanceId: 'in2', primaryCategory: 'Queued In', categories: ['Queued In'] },
    ];
    const seeded = seedFormalSwapsFromCategories(cards, []);
    expect(seeded).toHaveLength(2);
    expect(seeded[0].inInstanceId).toBe('in1');
    expect(seeded[0].outInstanceId).toBe('out1');
    expect(seeded[1].inInstanceId).toBe('in2');
    expect(seeded[1].outInstanceId).toBeNull();

    const kept = seedFormalSwapsFromCategories(cards, [
      { id: 's1', inInstanceId: 'in1', outInstanceId: 'out1', sortIndex: 0, notes: null },
    ]);
    expect(kept).toHaveLength(1);
    expect(kept[0].id).toBe('s1');
  });

  describe('addCardsToSwapQueueAsOut', () => {
    it('creates an uneven pair when the queue is empty', () => {
      const next = addCardsToSwapQueueAsOut([], ['c1']);
      expect(next).toHaveLength(1);
      expect(next[0]).toMatchObject({
        inInstanceId: null,
        outInstanceId: 'c1',
        sortIndex: 0,
      });
      expect(next[0]!.id).toMatch(/^swap-/);
    });

    it('fills the first empty out slot', () => {
      const next = addCardsToSwapQueueAsOut(
        [
          { id: 's1', inInstanceId: 'in1', outInstanceId: null, sortIndex: 0, notes: null },
          { id: 's2', inInstanceId: 'in2', outInstanceId: null, sortIndex: 1, notes: null },
        ],
        ['out1'],
      );
      expect(next).toHaveLength(2);
      expect(next[0]!.outInstanceId).toBe('out1');
      expect(next[0]!.inInstanceId).toBe('in1');
      expect(next[1]!.outInstanceId).toBeNull();
    });

    it('fills a blank pair before appending', () => {
      const next = addCardsToSwapQueueAsOut(
        [{ id: 'blank', inInstanceId: null, outInstanceId: null, sortIndex: 0, notes: null }],
        ['out1'],
      );
      expect(next).toHaveLength(1);
      expect(next[0]!.id).toBe('blank');
      expect(next[0]!.outInstanceId).toBe('out1');
      expect(next[0]!.inInstanceId).toBeNull();
    });

    it('fills then creates for multiple ids', () => {
      const next = addCardsToSwapQueueAsOut(
        [{ id: 's1', inInstanceId: 'in1', outInstanceId: null, sortIndex: 0, notes: null }],
        ['out1', 'out2'],
      );
      expect(next).toHaveLength(2);
      expect(next[0]!.outInstanceId).toBe('out1');
      expect(next[1]!.outInstanceId).toBe('out2');
      expect(next[1]!.inInstanceId).toBeNull();
      expect(next[1]!.sortIndex).toBe(1);
    });

    it('skips ids already used as out', () => {
      const existing = [
        { id: 's1', inInstanceId: 'in1', outInstanceId: 'out1', sortIndex: 0, notes: null },
      ];
      const next = addCardsToSwapQueueAsOut(existing, ['out1', 'out2']);
      expect(next).toHaveLength(2);
      expect(next[0]!.outInstanceId).toBe('out1');
      expect(next[1]!.outInstanceId).toBe('out2');
    });
  });

  describe('formalSwapInIds', () => {
    it('collects non-null inInstanceIds', () => {
      expect(
        [...formalSwapInIds([
          { id: 's1', inInstanceId: 'in1', outInstanceId: 'out1', sortIndex: 0, notes: null },
          { id: 's2', inInstanceId: null, outInstanceId: 'out2', sortIndex: 1, notes: null },
          { id: 's3', inInstanceId: 'in2', outInstanceId: null, sortIndex: 2, notes: null },
        ])].sort(),
      ).toEqual(['in1', 'in2']);
      expect(formalSwapInIds([]).size).toBe(0);
    });
  });

  describe('splitOutInstance', () => {
    it('no-ops when quantity is 1', () => {
      const cards = plainsStackDeck(1).cards;
      const result = splitOutInstance(cards, 'plains-stack', () => 'unused');
      expect(result.outInstanceId).toBe('plains-stack');
      expect(result.cards).toHaveLength(cards.length);
      expect(result.cards.find((c) => c.instanceId === 'plains-stack')!.quantity).toBe(1);
    });

    it('peels one copy from a multi-qty stack', () => {
      let n = 0;
      const result = splitOutInstance(plainsStackDeck(6).cards, 'plains-stack', () => `split-${++n}`);
      expect(result.outInstanceId).toBe('split-1');
      const stack = result.cards.find((c) => c.instanceId === 'plains-stack')!;
      const peeled = result.cards.find((c) => c.instanceId === 'split-1')!;
      expect(stack.quantity).toBe(5);
      expect(peeled.quantity).toBe(1);
      expect(peeled.name).toBe('Plains');
      expect(peeled.primaryCategory).toBe('Land');
    });
  });

  describe('syncCardsWithFormalSwaps / queueCardsAsOut', () => {
    const baseDeck = commander as unknown as DeckDocument;

    it('moves Out to Queued Out and drops deck size by one', () => {
      const before = deckSize(baseDeck);
      const outId = baseDeck.cards[0]!.instanceId;
      const next = queueCardsAsOut(baseDeck, [outId]);
      const outCard = next.cards.find((c) => c.instanceId === outId)!;
      expect(outCard.primaryCategory).toBe('Queued Out');
      expect(next.categories.some((c) => c.name === 'Queued Out' && c.includedInDeck === false)).toBe(
        true,
      );
      expect(deckSize(next)).toBe(before - 1);
    });

    it('splits a basic land stack so only one copy leaves the deck', () => {
      const deck = plainsStackDeck(6);
      const before = deckSize(deck);
      let n = 0;
      const next = syncCardsWithFormalSwaps(
        deck,
        addCardsToSwapQueueAsOut([], ['plains-stack']),
        { nextId: () => `out-${++n}` },
      );
      const stack = next.cards.find((c) => c.instanceId === 'plains-stack')!;
      const outId = next.formalSwapEntries[0]!.outInstanceId!;
      const outCard = next.cards.find((c) => c.instanceId === outId)!;
      expect(stack.primaryCategory).toBe('Land');
      expect(stack.quantity).toBe(5);
      expect(outId).toBe('out-1');
      expect(outCard.primaryCategory).toBe('Queued Out');
      expect(outCard.quantity).toBe(1);
      expect(deckSize(next)).toBe(before - 1);
    });

    it('queues a second Out from the same basic stack', () => {
      const deck = plainsStackDeck(6);
      let n = 0;
      const nextId = () => `out-${++n}`;
      const once = syncCardsWithFormalSwaps(
        deck,
        addCardsToSwapQueueAsOut([], ['plains-stack']),
        { nextId },
      );
      const twice = syncCardsWithFormalSwaps(
        once,
        addCardsToSwapQueueAsOut(once.formalSwapEntries, ['plains-stack']),
        { nextId },
      );
      const stack = twice.cards.find((c) => c.instanceId === 'plains-stack')!;
      const outIds = twice.formalSwapEntries.map((e) => e.outInstanceId).filter(Boolean) as string[];
      expect(stack.quantity).toBe(4);
      expect(outIds).toHaveLength(2);
      expect(new Set(outIds).size).toBe(2);
      for (const id of outIds) {
        const card = twice.cards.find((c) => c.instanceId === id)!;
        expect(card.primaryCategory).toBe('Queued Out');
        expect(card.quantity).toBe(1);
      }
    });

    it('merges a restored basic Out back into the stack', () => {
      const deck = plainsStackDeck(6);
      let n = 0;
      const queued = syncCardsWithFormalSwaps(
        deck,
        addCardsToSwapQueueAsOut([], ['plains-stack']),
        { nextId: () => `out-${++n}` },
      );
      expect(queued.cards.find((c) => c.instanceId === 'plains-stack')!.quantity).toBe(5);
      const cleared = syncCardsWithFormalSwaps(queued, []);
      const stack = cleared.cards.find((c) => c.instanceId === 'plains-stack')!;
      expect(stack.quantity).toBe(6);
      expect(cleared.cards.filter((c) => c.name === 'Plains')).toHaveLength(1);
      expect(cleared.formalSwapEntries).toHaveLength(0);
    });

    it('places In in target category so it remains counted', () => {
      const inId = baseDeck.cards[2]!.instanceId;
      const outId = baseDeck.cards[0]!.instanceId;
      const next = syncCardsWithFormalSwaps(baseDeck, [
        {
          id: 's1',
          inInstanceId: inId,
          outInstanceId: outId,
          inTargetCategory: 'Creature',
          sortIndex: 0,
          notes: null,
        },
      ]);
      const inCard = next.cards.find((c) => c.instanceId === inId)!;
      const outCard = next.cards.find((c) => c.instanceId === outId)!;
      expect(inCard.primaryCategory).toBe('Creature');
      expect(outCard.primaryCategory).toBe('Queued Out');
      expect(deckSize(next)).toBeGreaterThan(0);
    });

    it('restores Out when entry is removed', () => {
      const outId = baseDeck.cards[0]!.instanceId;
      const originalPrimary = baseDeck.cards[0]!.primaryCategory;
      const queued = queueCardsAsOut(baseDeck, [outId]);
      const cleared = syncCardsWithFormalSwaps(queued, []);
      const card = cleared.cards.find((c) => c.instanceId === outId)!;
      expect(card.primaryCategory).toBe(originalPrimary);
      expect(card.primaryCategory).not.toBe('Queued Out');
    });
  });
});
