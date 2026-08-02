import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { WantSource } from '@rayenz-hub/shared';
import { SwapQueueApp } from '../../packages/web/src/swap-queue/SwapQueueApp';

const mockLoadSwapWantSources = vi.fn();
const mockFetchInSetMembership = vi.fn();

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

vi.mock('@rayenz-hub/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@rayenz-hub/shared')>();
  return {
    ...actual,
    fetchInSetMembership: (...args: unknown[]) => mockFetchInSetMembership(...args),
  };
});

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

describe('SwapQueueApp set filter', () => {
  it('keeps a swap pair when only the Out side matches the set filter', async () => {
    mockLoadSwapWantSources.mockResolvedValue({
      decks: [],
      sources: [
        source({
          kind: 'queued_in',
          entryId: 'pair-1',
          cardName: 'Ponder',
          mergeKey: 'ponder',
          cardInstanceId: 'in1',
          inInstanceId: 'in1',
          outInstanceId: 'out1',
        }),
        source({
          kind: 'queued_out',
          entryId: 'pair-1',
          cardName: 'Sol Ring',
          mergeKey: 'sol ring',
          cardInstanceId: 'out1',
          inInstanceId: 'in1',
          outInstanceId: 'out1',
        }),
        source({
          kind: 'queued_in',
          entryId: 'pair-2',
          deckId: 'd2',
          deckName: 'Other',
          cardName: 'Island',
          mergeKey: 'island',
          cardInstanceId: 'in2',
        }),
      ],
    });
    mockFetchInSetMembership.mockResolvedValue(new Set(['sol ring']));

    const user = userEvent.setup();
    render(<SwapQueueApp entryPath="wishlist" />);

    await waitFor(() => expect(screen.getByText(/Ponder/)).toBeInTheDocument());
    expect(screen.getByText(/Island/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Set/i }));
    const codesInput = screen.getByLabelText('Set codes');
    await user.clear(codesInput);
    await user.type(codesInput, 'cmm');
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    await waitFor(() => {
      expect(mockFetchInSetMembership).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(screen.getByText(/Ponder/)).toBeInTheDocument();
      expect(screen.getByText(/Sol Ring/)).toBeInTheDocument();
      expect(screen.queryByText(/Island/)).not.toBeInTheDocument();
    });
  });
});
