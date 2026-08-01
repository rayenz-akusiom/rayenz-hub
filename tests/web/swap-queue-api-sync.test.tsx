import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { WantSource } from '@rayenz-hub/shared';
import { SwapQueueApp } from '../../packages/web/src/swap-queue/SwapQueueApp';

const mockLoadSwapWantSources = vi.fn();
const mockPullRemoteLibraryUpdates = vi.fn(async () => []);

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
  pullRemoteLibraryUpdates: () => mockPullRemoteLibraryUpdates(),
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

describe('SwapQueueApp Hub API sync', () => {
  it('pulls remote library updates on mount before loading wants', async () => {
    const order: string[] = [];
    mockPullRemoteLibraryUpdates.mockImplementation(async () => {
      order.push('pull');
      return [];
    });
    mockLoadSwapWantSources.mockImplementation(async () => {
      order.push('load');
      return { decks: [], sources: [source()] };
    });

    render(<SwapQueueApp entryPath="wishlist" />);

    await waitFor(() => expect(screen.getByText(/Sol Ring/)).toBeInTheDocument());
    expect(mockPullRemoteLibraryUpdates).toHaveBeenCalledTimes(1);
    expect(mockLoadSwapWantSources).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['pull', 'load']);
  });

  it('pulls again when Refresh is selected', async () => {
    mockLoadSwapWantSources.mockResolvedValue({ decks: [], sources: [source()] });
    const user = userEvent.setup();
    render(<SwapQueueApp entryPath="wishlist" />);

    await waitFor(() => expect(screen.getByText(/Sol Ring/)).toBeInTheDocument());
    expect(mockPullRemoteLibraryUpdates).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: /Swap Queue actions/i }));
    await user.click(screen.getByRole('menuitem', { name: /Refresh/i }));

    await waitFor(() => expect(mockPullRemoteLibraryUpdates).toHaveBeenCalledTimes(2));
    expect(mockLoadSwapWantSources).toHaveBeenCalledTimes(2);
  });

  it('still loads local wants when pull fails', async () => {
    mockPullRemoteLibraryUpdates.mockRejectedValue(new Error('Hub API unreachable'));
    mockLoadSwapWantSources.mockResolvedValue({ decks: [], sources: [source()] });

    render(<SwapQueueApp entryPath="wishlist" />);

    await waitFor(() => expect(screen.getByText(/Sol Ring/)).toBeInTheDocument());
    expect(screen.getByText(/Hub API unreachable/)).toBeInTheDocument();
  });
});
