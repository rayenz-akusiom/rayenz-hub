import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
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

vi.mock('../../packages/web/src/swap-queue/enrich-prices', () => ({
  enrichWantSourcesUsd: async (sources: unknown) => sources,
}));

function source(over: Partial<WantSource> = {}): WantSource {
  return {
    deckId: 'd1',
    deckName: 'Commander Deck',
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

describe('SwapQueueApp aggregate loading', () => {
  it('shows the empty state when there are no want sources', async () => {
    mockLoadSwapWantSources.mockResolvedValue({ decks: [], sources: [] });
    render(<SwapQueueApp />);
    await waitFor(() => {
      expect(screen.getByTestId('swap-queue-empty')).toBeInTheDocument();
    });
  });

  it('lists want sources aggregated across multiple decks', async () => {
    mockLoadSwapWantSources.mockResolvedValue({
      decks: [],
      sources: [
        source({ deckId: 'd1', deckName: 'Commander Deck', cardName: 'Sol Ring', entryId: 'e1' }),
        source({
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
