import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { WantSource } from '@rayenz-hub/shared';
import { SwapQueueApp } from '../../packages/web/src/swap-queue/SwapQueueApp';

const mockLoadSwapWantSources = vi.fn();
const mockCopyArchidektWants = vi.fn();
const mockCopyNameQtyWants = vi.fn();

vi.mock('../../packages/web/src/swap-queue/aggregate', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../packages/web/src/swap-queue/aggregate')>();
  return {
    ...actual,
    loadSwapWantSources: () => mockLoadSwapWantSources(),
  };
});

vi.mock('../../packages/web/src/swap-queue/export-ui', () => ({
  copyArchidektWants: (...args: unknown[]) => mockCopyArchidektWants(...args),
  copyNameQtyWants: (...args: unknown[]) => mockCopyNameQtyWants(...args),
}));

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

describe('SwapQueueApp export actions', () => {
  beforeEach(() => {
    mockLoadSwapWantSources.mockResolvedValue({ decks: [], sources: [source()] });
  });

  it('copies an Archidekt-style import list', async () => {
    mockCopyArchidektWants.mockResolvedValue(true);
    const user = userEvent.setup();
    render(<SwapQueueApp entryPath="wishlist" />);
    await waitFor(() => expect(screen.getByText(/Sol Ring/)).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Swap Queue actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Export Archidekt' }));

    expect(mockCopyArchidektWants).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ cardName: 'Sol Ring' })]),
    );
    await waitFor(() => {
      expect(screen.getByText('Copied Archidekt-style list')).toBeInTheDocument();
    });
  });

  it('copies a name/qty list', async () => {
    mockCopyNameQtyWants.mockResolvedValue(true);
    const user = userEvent.setup();
    render(<SwapQueueApp entryPath="wishlist" />);
    await waitFor(() => expect(screen.getByText(/Sol Ring/)).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Swap Queue actions' }));
    await user.click(screen.getByRole('menuitem', { name: 'Export name/qty' }));

    expect(mockCopyNameQtyWants).toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByText('Copied name/qty list')).toBeInTheDocument();
    });
  });
});
