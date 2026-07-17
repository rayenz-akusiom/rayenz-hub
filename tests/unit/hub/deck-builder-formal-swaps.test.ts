import { describe, it, expect } from 'vitest';
import {
  applyFormalSwapsToCards,
  incompleteEntryCount,
  normalizeFormalEntries,
  seedFormalSwapsFromCategories,
} from '../../../packages/shared/src/deck-builder/formal-swaps.ts';
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
    expect(byId.c3.primaryCategory).toBe('New Set In');
    expect(byId.c1.primaryCategory).toBe('New Set Out');
  });

  it('seeds pairs from New Set In/Out and preserves existing', () => {
    const cards = [
      { ...commander.cards[0], instanceId: 'in1', primaryCategory: 'New Set In', categories: ['New Set In'] },
      { ...commander.cards[1], instanceId: 'out1', primaryCategory: 'New Set Out', categories: ['New Set Out'] },
      { ...commander.cards[2], instanceId: 'in2', primaryCategory: 'New Set In', categories: ['New Set In'] },
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
});
