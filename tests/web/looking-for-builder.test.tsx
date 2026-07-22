import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DeckDocument } from '@rayenz-hub/shared';
import { SwapQueuePanel } from '../../packages/web/src/deck-builder/swaps/SwapQueuePanel';
import commanderFixture from '../fixtures/deck-builder/commander-slice.json';

const commanderDoc = commanderFixture as DeckDocument;

function baseDeck(over: Partial<DeckDocument> = {}): DeckDocument {
  return {
    ...commanderDoc,
    formalSwapEntries: [],
    lookingForEntries: [],
    ...over,
  };
}

function renderPanel(
  deck: DeckDocument,
  overrides: Partial<{
    onAddLookingFor: (...args: unknown[]) => void;
    onRemoveLookingFor: (...args: unknown[]) => void;
  }> = {},
) {
  return render(
    <SwapQueuePanel
      deck={deck}
      onChange={() => {}}
      draft={null}
      onStartEdit={() => {}}
      onDraftChange={() => {}}
      onConfirmIn={() => {}}
      onCancelEdit={() => {}}
      onSaveEdit={() => {}}
      onRemoveEdit={() => {}}
      onAddLookingFor={overrides.onAddLookingFor ?? vi.fn()}
      onRemoveLookingFor={overrides.onRemoveLookingFor ?? vi.fn()}
    />,
  );
}

afterEach(() => {
  cleanup();
});

describe('SwapQueuePanel Seeking section', () => {
  it('renders a Seeking heading with an empty state by default', () => {
    renderPanel(baseDeck());
    expect(screen.getByRole('heading', { name: 'Seeking' })).toBeInTheDocument();
    expect(screen.getByText('No Seeking cards yet.')).toBeInTheDocument();
  });

  it('lists Seeking entries by card face name', () => {
    const deck = baseDeck({
      lookingForEntries: [{ id: 'lf1', instanceId: 'c3', sortIndex: 0, notes: null }],
    });
    renderPanel(deck);
    expect(screen.getByText('Counterspell')).toBeInTheDocument();
    expect(screen.queryByText('No Seeking cards yet.')).not.toBeInTheDocument();
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
      lookingForEntries: [],
    });
    renderPanel(deck);
    expect(screen.queryByText('Shivan Dragon')).not.toBeInTheDocument();
    expect(screen.getByText('No Seeking cards yet.')).toBeInTheDocument();
  });

  it('calls onRemoveLookingFor with the entry id when Remove is clicked', async () => {
    const onRemoveLookingFor = vi.fn();
    const deck = baseDeck({
      lookingForEntries: [{ id: 'lf1', instanceId: 'c3', sortIndex: 0, notes: null }],
    });
    const user = userEvent.setup();
    renderPanel(deck, { onRemoveLookingFor });

    await user.click(screen.getByRole('button', { name: 'Remove Counterspell from Seeking' }));
    expect(onRemoveLookingFor).toHaveBeenCalledWith('lf1');
  });

  it('opens the Scryfall search modal to add a card when Add is clicked', async () => {
    const user = userEvent.setup();
    renderPanel(baseDeck());

    await user.click(screen.getByRole('button', { name: 'Add to Seeking' }));

    expect(screen.getByRole('dialog', { name: 'Add card to Seeking' })).toBeInTheDocument();
  });
});
