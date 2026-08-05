import './helpers/swap-queue-vi-mocks';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockLoadSwapWantSources, wantSource } from './helpers/swap-queue-harness';
import { SwapQueueApp } from '../../packages/web/src/swap-queue/SwapQueueApp';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('SwapQueueApp min USD price filter', () => {
  it('hides cheap priced sources but keeps unpriced ones (buried in actions menu)', async () => {
    mockLoadSwapWantSources.mockResolvedValue({
      decks: [],
      sources: [
        wantSource({ deckId: 'd1', entryId: 'e1', cardName: 'Cheap Card', mergeKey: 'cheap', usd: 1 }),
        wantSource({
          deckId: 'd2',
          entryId: 'e2',
          cardName: 'Pricey Card',
          mergeKey: 'pricey',
          usd: 20,
        }),
        wantSource({
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
