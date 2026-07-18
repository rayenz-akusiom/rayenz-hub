import { describe, it, expect } from 'vitest';
import {
  addCardsToSwapQueueAsOut,
  applyFormalSwapsToCards,
  formalSwapInIds,
  incompleteEntryCount,
  normalizeFormalEntries,
  queueCardsAsOut,
  seedFormalSwapsFromCategories,
  syncCardsWithFormalSwaps,
} from '../../../packages/shared/src/deck-builder/formal-swaps.ts';
import { deckSize } from '../../../packages/shared/src/deck-builder/browse.ts';
import type { DeckDocument } from '../../../packages/shared/src/schemas/deck-builder.ts';
import commander from '../../fixtures/deck-builder/commander-slice.json';

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

  describe('syncCardsWithFormalSwaps / queueCardsAsOut', () => {
    const baseDeck = commander as unknown as DeckDocument;

    it('moves Out to Queued Out and drops deck size', () => {
      const before = deckSize(baseDeck);
      const outId = baseDeck.cards[0]!.instanceId;
      const next = queueCardsAsOut(baseDeck, [outId]);
      const outCard = next.cards.find((c) => c.instanceId === outId)!;
      expect(outCard.primaryCategory).toBe('Queued Out');
      expect(next.categories.some((c) => c.name === 'Queued Out' && c.includedInDeck === false)).toBe(
        true,
      );
      expect(deckSize(next)).toBe(before - (Number(outCard.quantity) || 1));
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
