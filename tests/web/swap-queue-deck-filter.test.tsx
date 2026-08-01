import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { WantSource } from '@rayenz-hub/shared';
import { SwapQueueApp } from '../../packages/web/src/swap-queue/SwapQueueApp';

const mockLoadSwapWantSources = vi.fn();

vi.mock('../../packages/web/src/swap-queue/aggregate', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../packages/web/src/swap-queue/aggregate')>();
  return {
    ...actual,
    loadSwapWantSources: () => mockLoadSwapWantSources(),
  };
});

vi.mock('../../packages/web/src/deck-builder/store/deck-store', () => ({
  saveDeck: vi.fn(),
}));

vi.mock('../../packages/web/src/deck-builder/store/library-sync', () => ({
  pullRemoteLibraryUpdates: vi.fn(async () => []),
}));

vi.mock('../../packages/web/src/swap-queue/enrich-prices', () => ({
  enrichWantSourcesUsd: async (sources: unknown) => sources,
}));

function source(over: Partial<WantSource> = {}): WantSource {
  return {
    deckId: 'd1',
    deckName: 'Alpha Deck',
    format: 'commander',
    kind: 'queued_in',
    entryId: 'e1',
    cardInstanceId: 'c1',
    cardName: 'Sol Ring',
    mergeKey: 'sol ring',
    quantity: 1,
    usd: null,
    outInstanceId: 'o1',
    inInstanceId: 'c1',
    pairIncomplete: false,
    ...over,
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('SwapQueueApp by-deck filter', () => {
  it('filters to selected deck and Clear restores all', async () => {
    mockLoadSwapWantSources.mockResolvedValue({
      decks: [],
      sources: [
        source({
          deckId: 'd1',
          deckName: 'Alpha Deck',
          entryId: 'e1',
          cardName: 'Alpha Card',
          mergeKey: 'alpha',
        }),
        source({
          deckId: 'd2',
          deckName: 'Bravo Deck',
          entryId: 'e2',
          cardName: 'Bravo Card',
          mergeKey: 'bravo',
        }),
      ],
    });
    const user = userEvent.setup();
    render(<SwapQueueApp entryPath="wishlist" />);

    await waitFor(() => expect(screen.getByText(/Alpha Card/)).toBeInTheDocument());
    expect(screen.getByText(/Bravo Card/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Deck/i }));
    const filterGroup = screen.getByRole('group', { name: 'Filter by deck' });
    await user.click(within(filterGroup).getByLabelText('Alpha Deck'));

    await waitFor(() => {
      expect(screen.queryByText(/Bravo Card/)).not.toBeInTheDocument();
    });
    expect(screen.getByText(/Alpha Card/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Clear/i }));

    await waitFor(() => {
      expect(screen.getByText(/Bravo Card/)).toBeInTheDocument();
    });
    expect(screen.getByText(/Alpha Card/)).toBeInTheDocument();
  });

  it('shows filter-empty message when deck filter leaves no visible items after price filter', async () => {
    mockLoadSwapWantSources.mockResolvedValue({
      decks: [],
      sources: [
        source({
          deckId: 'd1',
          deckName: 'Alpha Deck',
          entryId: 'e1',
          cardName: 'Alpha Card',
          mergeKey: 'alpha',
          usd: 1,
        }),
        source({
          deckId: 'd2',
          deckName: 'Bravo Deck',
          entryId: 'e2',
          cardName: 'Bravo Card',
          mergeKey: 'bravo',
          usd: 20,
        }),
      ],
    });
    const user = userEvent.setup();
    render(<SwapQueueApp entryPath="wishlist" />);

    await waitFor(() => expect(screen.getByText(/Alpha Card/)).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /Deck/i }));
    const filterGroup = screen.getByRole('group', { name: 'Filter by deck' });
    await user.click(within(filterGroup).getByLabelText('Alpha Deck'));

    await user.click(screen.getByRole('button', { name: 'Swap Queue actions' }));
    const minInput = screen.getByLabelText('Min USD');
    await user.clear(minInput);
    await user.type(minInput, '5');

    await waitFor(() => {
      expect(screen.getByTestId('swap-queue-empty')).toHaveTextContent(
        'No queue items match the current filters.',
      );
    });
  });
});
