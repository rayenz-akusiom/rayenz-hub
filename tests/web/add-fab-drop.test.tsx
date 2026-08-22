import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { CardInstance, DeckDocument } from '@rayenz-hub/shared';
import { AddCardFab } from '../../packages/web/src/deck-builder/browse/AddCardFab';
import { BrowseShell } from '../../packages/web/src/deck-builder/browse/BrowseShell';
import { DRAG_MIME } from '../../packages/web/src/deck-builder/browse/CardTile';
import commanderFixture from '../fixtures/deck-builder/commander-slice.json';

vi.mock('../../packages/web/src/deck-builder/scryfall/useScryfallEnrich', () => ({
  useScryfallEnrich: () => ({ enriching: false }),
}));

vi.mock('../../packages/web/src/deck-suggest/data', () => ({
  readProfileForDeck: vi.fn(async () => null),
}));

vi.mock('../../packages/web/src/mtg/profile-sync', () => ({
  ProfileSync: {
    isConnected: vi.fn(async () => false),
    connectProfilesDir: vi.fn(async () => {}),
    readProfileYaml: vi.fn(async () => null),
  },
}));

const commanderDoc = commanderFixture as DeckDocument;

afterEach(() => {
  cleanup();
});

function dragDataTransfer(instanceId: string) {
  return {
    types: [DRAG_MIME, 'text/plain'],
    dropEffect: 'move',
    effectAllowed: 'move',
    setData: vi.fn(),
    getData: (type: string) =>
      type === DRAG_MIME || type === 'text/plain' ? instanceId : '',
  };
}

function startDeckBuilderDrag() {
  fireEvent.dragStart(document.body, {
    dataTransfer: dragDataTransfer('c1'),
  });
}

describe('AddCardFab drag target', () => {
  it('morphs into Default, Maybeboard, and New Category zones while dragging', () => {
    render(
      <AddCardFab
        onAddClick={() => {}}
        onDropDefault={() => {}}
        onDropMaybeboard={() => {}}
        onDropNewCategory={() => {}}
      />,
    );

    expect(screen.getByRole('button', { name: 'Add card' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Default category')).not.toBeInTheDocument();

    startDeckBuilderDrag();

    expect(screen.queryByRole('button', { name: 'Add card' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Default category')).toBeInTheDocument();
    expect(screen.getByLabelText('Maybeboard category')).toBeInTheDocument();
    expect(screen.getByLabelText('New category')).toBeInTheDocument();
    expect(screen.getByText('Default')).toBeInTheDocument();
    expect(screen.getByText('Maybeboard')).toBeInTheDocument();
    expect(screen.getByText('New Category')).toBeInTheDocument();
  });

  it('invokes Default, Maybeboard, and New Category drop handlers with instance ids', () => {
    const onDropDefault = vi.fn();
    const onDropMaybeboard = vi.fn();
    const onDropNewCategory = vi.fn();
    render(
      <AddCardFab
        onAddClick={() => {}}
        onDropDefault={onDropDefault}
        onDropMaybeboard={onDropMaybeboard}
        onDropNewCategory={onDropNewCategory}
      />,
    );

    startDeckBuilderDrag();

    fireEvent.drop(screen.getByLabelText('Default category'), {
      dataTransfer: dragDataTransfer('c1'),
    });
    expect(onDropDefault).toHaveBeenCalledWith(['c1']);

    startDeckBuilderDrag();
    fireEvent.drop(screen.getByLabelText('Maybeboard category'), {
      dataTransfer: dragDataTransfer('c3'),
    });
    expect(onDropMaybeboard).toHaveBeenCalledWith(['c3']);

    startDeckBuilderDrag();
    fireEvent.drop(screen.getByLabelText('New category'), {
      dataTransfer: dragDataTransfer('c2'),
    });
    expect(onDropNewCategory).toHaveBeenCalledWith(['c2']);
  });
});

describe('BrowseShell FAB category drops', () => {
  function misplacedCreatureDeck(): DeckDocument {
    const bird = commanderDoc.cards[0] as CardInstance;
    return {
      ...commanderDoc,
      cardLayoutDefault: 'grid',
      cards: [
        {
          ...bird,
          primaryCategory: 'Maybeboard',
          categories: ['Maybeboard'],
        },
        ...commanderDoc.cards.slice(1),
      ],
    };
  }

  it('moves a card to its default category when dropped on Default', () => {
    const onChange = vi.fn();
    const deck = misplacedCreatureDeck();
    render(<BrowseShell deck={deck} onChange={onChange} onBack={() => {}} />);

    startDeckBuilderDrag();
    fireEvent.drop(screen.getByLabelText('Default category'), {
      dataTransfer: dragDataTransfer('c1'),
    });

    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls[0]![0] as DeckDocument;
    const bird = next.cards.find((c) => c.instanceId === 'c1');
    expect(bird?.primaryCategory).toBe('Creature');
  });

  it('moves a main-deck card to Maybeboard when dropped on Maybeboard', () => {
    const onChange = vi.fn();
    const deck: DeckDocument = { ...commanderDoc, cardLayoutDefault: 'grid' };
    render(<BrowseShell deck={deck} onChange={onChange} onBack={() => {}} />);

    startDeckBuilderDrag();
    fireEvent.drop(screen.getByLabelText('Maybeboard category'), {
      dataTransfer: dragDataTransfer('c1'),
    });

    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls[0]![0] as DeckDocument;
    const bird = next.cards.find((c) => c.instanceId === 'c1');
    expect(bird?.primaryCategory).toBe('Maybeboard');
    expect(next.categories.some((c) => c.name === 'Maybeboard')).toBe(true);
  });

  it('opens MoveSheet in new-category mode when dropped on New Category', () => {
    const deck = misplacedCreatureDeck();
    render(<BrowseShell deck={deck} onChange={() => {}} onBack={() => {}} />);

    startDeckBuilderDrag();
    fireEvent.drop(screen.getByLabelText('New category'), {
      dataTransfer: dragDataTransfer('c1'),
    });

    expect(screen.getByRole('dialog', { name: 'Move card' })).toBeInTheDocument();
    expect(screen.getByLabelText('New category name')).toBeInTheDocument();
  });
});
