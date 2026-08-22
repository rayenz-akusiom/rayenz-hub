import './helpers/swap-queue-vi-mocks';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockLoadSwapWantSources, wantSource } from './helpers/swap-queue-harness';
import { SwapQueueApp } from '../../packages/web/src/swap-queue/SwapQueueApp';
import { CURRENCY_STORAGE_KEY } from '../../packages/web/src/swap-queue/price-prefs';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  localStorage.removeItem(CURRENCY_STORAGE_KEY);
});

describe('SwapQueueApp by-deck filter', () => {
  it('filters to selected deck and Clear restores all', async () => {
    mockLoadSwapWantSources.mockResolvedValue({
      decks: [],
      sources: [
        wantSource({
          deckId: 'd1',
          deckName: 'Alpha Deck',
          entryId: 'e1',
          cardName: 'Alpha Card',
          mergeKey: 'alpha',
        }),
        wantSource({
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

    await user.click(screen.getByRole('button', { name: /^Filters/ }));
    const filterGroup = screen.getByRole('group', { name: 'Filter by deck' });
    await user.click(within(filterGroup).getByLabelText('Alpha Deck'));

    await waitFor(() => {
      expect(screen.queryByText(/Bravo Card/)).not.toBeInTheDocument();
    });
    expect(screen.getByText(/Alpha Card/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Clear' }));

    await waitFor(() => {
      expect(screen.getByText(/Bravo Card/)).toBeInTheDocument();
    });
    expect(screen.getByText(/Alpha Card/)).toBeInTheDocument();
  });

  it('shows filter-empty message when deck filter leaves no visible items after price filter', async () => {
    mockLoadSwapWantSources.mockResolvedValue({
      decks: [],
      sources: [
        wantSource({
          deckId: 'd1',
          deckName: 'Alpha Deck',
          entryId: 'e1',
          cardName: 'Alpha Card',
          mergeKey: 'alpha',
          usd: 1,
        }),
        wantSource({
          deckId: 'd2',
          deckName: 'Bravo Deck',
          entryId: 'e2',
          cardName: 'Bravo Card',
          mergeKey: 'bravo',
          usd: 20,
        }),
      ],
    });
    localStorage.setItem(CURRENCY_STORAGE_KEY, 'USD');
    const user = userEvent.setup();
    render(<SwapQueueApp entryPath="wishlist" />);

    await waitFor(() => expect(screen.getByText(/Alpha Card/)).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /^Filters/ }));
    const filterGroup = screen.getByRole('group', { name: 'Filter by deck' });
    await user.click(within(filterGroup).getByLabelText('Alpha Deck'));

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
