import { describe, it, expect } from 'vitest';
import { moveCardCategory } from '../../../packages/shared/src/deck-builder/browse.ts';
import commander from '../../fixtures/deck-builder/commander-slice.json';
import {
  applyAddCard,
  applyCardMove,
  applyChangePrinting,
  applyRemoveCard,
} from '../../../packages/web/src/deck-builder/edit/card-mutations.ts';
import { mapScryfallCardToPrinting } from '../../../packages/shared/src/index.ts';

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

  it('applyAddCard / applyRemoveCard / applyChangePrinting', () => {
    const printing = mapScryfallCardToPrinting({
      id: 'sf-1',
      name: 'Lightning Bolt',
      set: 'lea',
      collector_number: '161',
      type_line: 'Instant',
      color_identity: ['R'],
      finishes: ['nonfoil'],
    });
    const added = applyAddCard(commander, printing, 'Maybeboard');
    const newCard = added.cards.find((c) => c.name === 'Lightning Bolt');
    expect(newCard).toBeTruthy();

    const changed = applyChangePrinting(added, newCard.instanceId, {
      ...printing,
      scryfallId: 'sf-2',
      setCode: 'm10',
      collectorNumber: '146',
    });
    expect(changed.cards.find((c) => c.instanceId === newCard.instanceId).setCode).toBe('m10');

    const removed = applyRemoveCard(changed, newCard.instanceId);
    expect(removed.cards.find((c) => c.instanceId === newCard.instanceId)).toBeUndefined();
  });
});
