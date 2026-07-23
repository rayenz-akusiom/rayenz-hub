import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { DeckDocument } from '@rayenz-hub/shared';
import { CategoryBrowse } from '../../packages/web/src/deck-builder/browse/CategoryBrowse';
import commanderFixture from '../fixtures/deck-builder/commander-slice.json';

const commanderDoc = commanderFixture as DeckDocument;

function baseDeck(over: Partial<DeckDocument> = {}): DeckDocument {
  return {
    ...commanderDoc,
    formalSwapEntries: [],
    lookingForEntries: [],
    categories: [
      ...(commanderDoc.categories || []),
      { name: 'Seeking', includedInDeck: false, includedInPrice: false, target: null },
    ],
    ...over,
  };
}

afterEach(() => {
  cleanup();
});

describe('CategoryBrowse aside Seeking section', () => {
  it('always renders a Seeking drop section when empty', () => {
    render(
      <CategoryBrowse
        deck={baseDeck()}
        mode="aside"
        layout="stacked"
        onDropCard={vi.fn()}
      />,
    );
    expect(screen.getByText('Seeking')).toBeInTheDocument();
  });

  it('lists Seeking primary cards in the aside section', () => {
    const deck = baseDeck({
      cards: commanderDoc.cards.map((c) =>
        c.instanceId === 'c3'
          ? { ...c, primaryCategory: 'Seeking', categories: ['Seeking'] }
          : c,
      ),
      lookingForEntries: [{ id: 'lf1', instanceId: 'c3', sortIndex: 0, notes: null }],
    });
    render(
      <CategoryBrowse
        deck={deck}
        mode="aside"
        layout="stacked"
        onDropCard={vi.fn()}
      />,
    );
    expect(screen.getByText('Counterspell')).toBeInTheDocument();
  });

  it('does not treat Maybeboard cards as Seeking', () => {
    const deck = baseDeck({
      cards: [
        ...commanderDoc.cards,
        {
          instanceId: 'mb1',
          name: 'Shivan Dragon',
          quantity: 1,
          primaryCategory: 'Maybeboard',
          categories: ['Maybeboard'],
          stack: null,
          setCode: null,
          collectorNumber: null,
          scryfallId: null,
          archidektCardId: null,
          foil: false,
          proxy: false,
        },
      ],
      categories: [
        ...(commanderDoc.categories || []),
        { name: 'Seeking', includedInDeck: false, includedInPrice: false, target: null },
        { name: 'Maybeboard', includedInDeck: false, includedInPrice: false, target: null },
      ],
    });
    render(
      <CategoryBrowse
        deck={deck}
        mode="aside"
        layout="stacked"
        onDropCard={vi.fn()}
      />,
    );
    expect(screen.getByText('Shivan Dragon')).toBeInTheDocument();
    expect(screen.getByText('Maybeboard')).toBeInTheDocument();
    expect(screen.getByText('Seeking')).toBeInTheDocument();
  });

  it('invokes onDropCard with Seeking when a card is dropped on the section', () => {
    const onDropCard = vi.fn();
    render(
      <CategoryBrowse
        deck={baseDeck()}
        mode="aside"
        layout="stacked"
        onDropCard={onDropCard}
      />,
    );
    const section = screen.getByText('Seeking').closest('.db-cat-column');
    expect(section).toBeTruthy();
    fireEvent.drop(section!, {
      dataTransfer: {
        getData: (type: string) => (type === 'text/plain' ? 'c1' : ''),
      },
      preventDefault: () => {},
    });
    expect(onDropCard).toHaveBeenCalledWith(['c1'], 'Seeking');
  });
});
