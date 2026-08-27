import './helpers/swap-queue-vi-mocks';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockLoadSwapWantSources, wantSource } from './helpers/swap-queue-harness';
import { SwapQueueApp } from '../../packages/web/src/swap-queue/SwapQueueApp';
import { cardInstance, leanDeck } from '../unit/helpers/deck-fixtures';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('SwapQueueApp main-deck-only filter', () => {
  it('hides aside Seeking and swap pairs, keeps in-deck Seeking', async () => {
    const deck = leanDeck({
      deckId: 'cmd1',
      name: 'Commander Deck',
      categories: [
        { name: 'Creature', includedInDeck: true, includedInPrice: true, target: null },
        { name: 'Seeking', includedInDeck: false, includedInPrice: false, target: null },
        { name: 'Other', includedInDeck: true, includedInPrice: true, target: null },
      ],
      cards: [
        cardInstance({
          instanceId: 'main-seek',
          name: 'Main Seek Card',
          primaryCategory: 'Creature',
          categories: ['Creature', 'Seeking'],
        }),
        cardInstance({
          instanceId: 'aside-seek',
          name: 'Aside Seek Card',
          primaryCategory: 'Seeking',
          categories: ['Seeking'],
        }),
        cardInstance({ instanceId: 'in1', name: 'Sol Ring', primaryCategory: 'Other' }),
        cardInstance({ instanceId: 'out1', name: 'Cut Card', primaryCategory: 'Other' }),
      ],
      lookingForEntries: [
        { id: 'lf1', instanceId: 'main-seek', sortIndex: 0, notes: null },
        { id: 'lf2', instanceId: 'aside-seek', sortIndex: 1, notes: null },
      ],
      formalSwapEntries: [
        {
          id: 's1',
          inInstanceId: 'in1',
          outInstanceId: 'out1',
          inTargetCategory: null,
          sortIndex: 0,
          notes: null,
        },
      ],
    });

    mockLoadSwapWantSources.mockResolvedValue({
      decks: [deck],
      sources: [
        wantSource({
          kind: 'seeking',
          deckId: 'cmd1',
          entryId: 'lf1',
          cardInstanceId: 'main-seek',
          cardName: 'Main Seek Card',
          mergeKey: 'main seek card',
        }),
        wantSource({
          kind: 'seeking',
          deckId: 'cmd1',
          entryId: 'lf2',
          cardInstanceId: 'aside-seek',
          cardName: 'Aside Seek Card',
          mergeKey: 'aside seek card',
        }),
        wantSource({
          kind: 'queued_in',
          deckId: 'cmd1',
          entryId: 's1',
          cardInstanceId: 'in1',
          cardName: 'Sol Ring',
          mergeKey: 'sol ring',
        }),
        wantSource({
          kind: 'queued_out',
          deckId: 'cmd1',
          entryId: 's1',
          cardInstanceId: 'out1',
          cardName: 'Cut Card',
          mergeKey: 'cut card',
        }),
      ],
    });

    const user = userEvent.setup();
    render(<SwapQueueApp entryPath="wishlist" />);

    await waitFor(() => expect(screen.getByText(/Main Seek Card/)).toBeInTheDocument());
    expect(screen.getByText(/Aside Seek Card/)).toBeInTheDocument();
    expect(screen.getByText(/Sol Ring/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Filters/ }));
    await user.click(screen.getByRole('checkbox', { name: 'Main deck only' }));

    await waitFor(() => {
      expect(screen.queryByText(/Aside Seek Card/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Sol Ring/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Cut Card/)).not.toBeInTheDocument();
    });
    expect(screen.getByText(/Main Seek Card/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove filter: Main deck only' })).toBeInTheDocument();
  });
});
