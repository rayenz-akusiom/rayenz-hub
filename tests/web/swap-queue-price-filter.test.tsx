import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
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

describe('SwapQueueApp min USD price filter', () => {
  it('hides cheap priced sources but keeps unpriced ones (buried in actions menu)', async () => {
    mockLoadSwapWantSources.mockResolvedValue({
      decks: [],
      sources: [
        source({ deckId: 'd1', entryId: 'e1', cardName: 'Cheap Card', mergeKey: 'cheap', usd: 1 }),
        source({
          deckId: 'd2',
          entryId: 'e2',
          cardName: 'Pricey Card',
          mergeKey: 'pricey',
          usd: 20,
        }),
        source({
          deckId: 'd3',
          entryId: 'e3',
          cardName: 'Unpriced Card',
          mergeKey: 'unpriced',
          usd: null,
        }),
      ],
    });
    const user = userEvent.setup();
    render(<SwapQueueApp entryPath="wishlist" />);

    await waitFor(() => expect(screen.getByText(/Cheap Card/)).toBeInTheDocument());
    expect(screen.getByText(/Pricey Card/)).toBeInTheDocument();
    expect(screen.getByText(/Unpriced Card/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Swap Queue actions' }));
    const minInput = screen.getByLabelText('Min USD');
    await user.clear(minInput);
    await user.type(minInput, '5');

    await waitFor(() => {
      expect(screen.queryByText(/Cheap Card/)).not.toBeInTheDocument();
    });
    expect(screen.getByText(/Pricey Card/)).toBeInTheDocument();
    expect(screen.getByText(/Unpriced Card/)).toBeInTheDocument();
  });
});
