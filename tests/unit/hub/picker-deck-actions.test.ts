import { describe, expect, it } from 'vitest';
import type { DeckDocument } from '@rayenz-hub/shared';
import {
  findDeckInstanceForPickerCard,
  removeOneCopyFromDeck,
} from '../../../packages/web/src/deck-builder/edit/card-mutations';
import commanderFixture from '../../fixtures/deck-builder/commander-slice.json';

const baseDeck = commanderFixture as DeckDocument;

describe('findDeckInstanceForPickerCard', () => {
  it('prefers matching scryfallId then falls back to last same-name', () => {
    const deck: DeckDocument = {
      ...baseDeck,
      cards: [
        { ...baseDeck.cards[0]!, instanceId: 'a', name: 'Sol Ring', scryfallId: 'sf-old' },
        { ...baseDeck.cards[0]!, instanceId: 'b', name: 'Sol Ring', scryfallId: 'sf-new' },
      ],
    };
    expect(
      findDeckInstanceForPickerCard(deck, { name: 'Sol Ring', scryfallId: 'sf-new' })
        ?.instanceId,
    ).toBe('b');
    expect(
      findDeckInstanceForPickerCard(deck, { name: 'Sol Ring', scryfallId: 'missing' })
        ?.instanceId,
    ).toBe('b');
  });
});

describe('removeOneCopyFromDeck', () => {
  it('removes a qty-1 instance', () => {
    const next = removeOneCopyFromDeck(baseDeck, { name: 'Birds of Paradise' });
    expect(next.cards.some((c) => c.name === 'Birds of Paradise')).toBe(false);
  });

  it('decrements a stacked basic instead of dropping the row', () => {
    const deck: DeckDocument = {
      ...baseDeck,
      cards: [
        {
          ...baseDeck.cards[1]!,
          name: 'Forest',
          quantity: 3,
          typeLine: 'Basic Land — Forest',
        },
      ],
    };
    const next = removeOneCopyFromDeck(deck, { name: 'Forest' });
    expect(next.cards).toHaveLength(1);
    expect(next.cards[0]!.quantity).toBe(2);
  });
});
