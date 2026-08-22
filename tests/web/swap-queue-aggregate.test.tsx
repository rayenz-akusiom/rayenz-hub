import './helpers/swap-queue-vi-mocks';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { mockLoadSwapWantSources, wantSource } from './helpers/swap-queue-harness';
import { SwapQueueApp } from '../../packages/web/src/swap-queue/SwapQueueApp';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('SwapQueueApp aggregate loading', () => {
  it('shows the empty state when there are no want sources', async () => {
    mockLoadSwapWantSources.mockResolvedValue({ decks: [], sources: [] });
    render(<SwapQueueApp />);
    await waitFor(() => {
      expect(screen.getByTestId('swap-queue-empty')).toBeInTheDocument();
    });
    expect(document.querySelector('.hub-sticky-chrome')).toBeTruthy();
    expect(document.querySelector('#sq-progress-host')).toBeTruthy();
    expect(screen.getByTestId('swap-queue-empty')).toHaveTextContent(/Seeking is cards you want/);
    expect(within(screen.getByTestId('swap-queue-empty')).getByRole('button', { name: 'Add swap' })).toBeDisabled();
  });

  it('lists want sources aggregated across multiple decks', async () => {
    mockLoadSwapWantSources.mockResolvedValue({
      decks: [],
      sources: [
        wantSource({ deckId: 'd1', deckName: 'Commander Deck', cardName: 'Sol Ring', entryId: 'e1' }),
        wantSource({
          deckId: 'd2',
          deckName: 'Cube',
          cardName: 'Counterspell',
          mergeKey: 'counterspell',
          kind: 'seeking',
          entryId: 'e2',
          outInstanceId: null,
          inInstanceId: null,
        }),
      ],
    });
    render(<SwapQueueApp entryPath="wishlist" />);
    await waitFor(() => {
      expect(screen.getByText(/Sol Ring/)).toBeInTheDocument();
    });
    expect(screen.getByText(/Counterspell/)).toBeInTheDocument();
    expect(screen.queryByTestId('swap-queue-empty')).not.toBeInTheDocument();
  });

  it('surfaces load errors', async () => {
    mockLoadSwapWantSources.mockRejectedValue(new Error('boom'));
    render(<SwapQueueApp />);
    await waitFor(() => {
      expect(screen.getByText('boom')).toBeInTheDocument();
    });
  });
});
