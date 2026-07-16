import { describe, it, expect } from 'vitest';
import { moveCardCategory } from '../../../packages/shared/src/deck-builder/browse.ts';
import commander from '../../fixtures/deck-builder/commander-slice.json';
import { applyCardMove } from '../../../packages/web/src/deck-builder/edit/card-mutations.ts';

describe('card mutations', () => {
  it('moves category and stack', () => {
    const next = moveCardCategory(commander.cards, 'c1', 'Ramp', 'Rocks');
    const card = next.find((c) => c.instanceId === 'c1');
    expect(card.primaryCategory).toBe('Ramp');
    expect(card.stack).toBe('Rocks');
  });

  it('applyCardMove updates document timestamp', () => {
    const doc = applyCardMove(commander, 'c1', 'Enchantment', null);
    expect(doc.cards.find((c) => c.instanceId === 'c1').primaryCategory).toBe('Enchantment');
    expect(doc.updatedAt).toBeTruthy();
  });
});
