import './helpers/swap-queue-vi-mocks';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockLoadSwapWantSources, wantSource } from './helpers/swap-queue-harness';
import { SwapQueueApp } from '../../packages/web/src/swap-queue/SwapQueueApp';
import {
  CURRENCY_STORAGE_KEY,
  SHOW_PRICES_STORAGE_KEY,
} from '../../packages/web/src/swap-queue/price-prefs';

function seeking(over: Parameters<typeof wantSource>[0] = {}) {
  return wantSource({
    kind: 'seeking',
    outInstanceId: null,
    inInstanceId: null,
    ...over,
  });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  localStorage.removeItem(CURRENCY_STORAGE_KEY);
  localStorage.removeItem(SHOW_PRICES_STORAGE_KEY);
});

describe('SwapQueueApp price filter', () => {
  it('hides cheap priced sources but keeps unpriced ones via Price menu', async () => {
    mockLoadSwapWantSources.mockResolvedValue({
      decks: [],
      sources: [
        seeking({ deckId: 'd1', entryId: 'e1', cardName: 'Cheap Card', mergeKey: 'cheap', usd: 1 }),
        seeking({
          deckId: 'd2',
          entryId: 'e2',
          cardName: 'Pricey Card',
          mergeKey: 'pricey',
          usd: 20,
        }),
        seeking({
          deckId: 'd3',
          entryId: 'e3',
          cardName: 'Unpriced Card',
          mergeKey: 'unpriced',
          usd: null,
        }),
      ],
    });
    localStorage.setItem(CURRENCY_STORAGE_KEY, 'USD');
    const user = userEvent.setup();
    render(<SwapQueueApp entryPath="swap-queue" />);

    await waitFor(() => expect(screen.getByText(/Cheap Card/)).toBeInTheDocument());
    expect(screen.getByText(/Pricey Card/)).toBeInTheDocument();
    expect(screen.getByText(/Unpriced Card/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Filters/ }));
    const minInput = screen.getByLabelText('Min USD');
    await user.clear(minInput);
    await user.type(minInput, '5');

    await waitFor(() => {
      expect(screen.queryByText(/Cheap Card/)).not.toBeInTheDocument();
    });
    expect(screen.getByText(/Pricey Card/)).toBeInTheDocument();
    expect(screen.getByText(/Unpriced Card/)).toBeInTheDocument();
  });

  it('applies Max filter and shows price badges while filter is active', async () => {
    mockLoadSwapWantSources.mockResolvedValue({
      decks: [],
      sources: [
        seeking({
          deckId: 'd1',
          entryId: 'e1',
          cardName: 'Cheap Card',
          mergeKey: 'cheap',
          usd: 1,
        }),
        seeking({
          deckId: 'd2',
          entryId: 'e2',
          cardName: 'Pricey Card',
          mergeKey: 'pricey',
          usd: 20,
        }),
      ],
    });
    localStorage.setItem(CURRENCY_STORAGE_KEY, 'USD');
    const user = userEvent.setup();
    render(<SwapQueueApp entryPath="swap-queue" />);

    await waitFor(() => expect(screen.getByText(/Cheap Card/)).toBeInTheDocument());
    expect(screen.queryByText('$1.00')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Filters/ }));
    await user.type(screen.getByLabelText('Max USD'), '5');

    await waitFor(() => {
      expect(screen.queryByText(/Pricey Card/)).not.toBeInTheDocument();
    });
    expect(screen.getByText(/Cheap Card/)).toBeInTheDocument();
    expect(screen.getByText('$1.00')).toBeInTheDocument();
  });

  it('shows prices when always-show is enabled without a filter', async () => {
    mockLoadSwapWantSources.mockResolvedValue({
      decks: [],
      sources: [
        seeking({
          deckId: 'd1',
          entryId: 'e1',
          cardName: 'Sol Ring',
          mergeKey: 'sol ring',
          usd: 2.5,
        }),
      ],
    });
    localStorage.setItem(CURRENCY_STORAGE_KEY, 'USD');
    localStorage.setItem(SHOW_PRICES_STORAGE_KEY, '1');
    render(<SwapQueueApp entryPath="swap-queue" />);

    await waitFor(() => expect(screen.getByText(/Sol Ring/)).toBeInTheDocument());
    expect(screen.getByText('$2.50')).toBeInTheDocument();
  });

  it('labels min/max with CAD when currency preference is CAD', async () => {
    mockLoadSwapWantSources.mockResolvedValue({
      decks: [],
      sources: [seeking({ usd: 2 })],
    });
    localStorage.setItem(CURRENCY_STORAGE_KEY, 'CAD');
    const user = userEvent.setup();
    render(<SwapQueueApp entryPath="swap-queue" />);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /^Filters/ })).toBeInTheDocument(),
    );
    await user.click(screen.getByRole('button', { name: /^Filters/ }));
    expect(screen.getByLabelText('Min CAD')).toBeInTheDocument();
    expect(screen.getByLabelText('Max CAD')).toBeInTheDocument();
  });
});
