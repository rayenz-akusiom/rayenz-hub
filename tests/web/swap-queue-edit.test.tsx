import './helpers/swap-queue-vi-mocks';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { aggregateSwapWants } from '@rayenz-hub/shared';
import {
  lookingForDeck,
  mockLoadSwapWantSources,
  mockSaveDeck,
  pairDeck,
} from './helpers/swap-queue-harness';
import { SwapQueueApp } from '../../packages/web/src/swap-queue/SwapQueueApp';
import { SANDBOX_USER_SLUG } from '../../packages/web/src/hub/routes';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.location.hash = '';
});

describe('SwapQueueApp edit chrome', () => {
  it('removes a Seeking entry and persists via saveDeck', async () => {
    const deck = lookingForDeck();
    mockLoadSwapWantSources.mockResolvedValue({
      decks: [deck],
      sources: aggregateSwapWants([deck]),
    });
    const user = userEvent.setup();
    render(<SwapQueueApp />);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Counterspell/ })).toBeInTheDocument(),
    );
    await user.click(screen.getByRole('button', { name: /Counterspell/ }));

    await waitFor(() => expect(screen.getByTestId('swap-queue-edit')).toBeInTheDocument());
    expect(screen.getByRole('dialog', { name: 'Edit Seeking' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remove' }));

    await waitFor(() => expect(mockSaveDeck).toHaveBeenCalledTimes(1));
    const saved = mockSaveDeck.mock.calls[0]![0]!;
    expect(saved.lookingForEntries).toHaveLength(0);
    expect(saved.cards.find((c) => c.instanceId === 'c1')?.primaryCategory).not.toBe(
      'Seeking',
    );

    await waitFor(() => expect(screen.getByText('Saved')).toBeInTheDocument());
    expect(screen.queryByTestId('swap-queue-edit')).not.toBeInTheDocument();
  });

  it('opens pair SwapEditChrome and removes the pair on Remove', async () => {
    const deck = pairDeck();
    mockLoadSwapWantSources.mockResolvedValue({
      decks: [deck],
      sources: aggregateSwapWants([deck]),
    });
    const user = userEvent.setup();
    render(<SwapQueueApp entryPath="swap-queue" />);

    await waitFor(() => expect(document.querySelector('.db-swap-pair')).toBeTruthy());
    await user.click(document.querySelector('.db-swap-pair')!);

    await waitFor(() =>
      expect(screen.getByRole('dialog', { name: 'Edit swap' })).toBeInTheDocument(),
    );
    expect(screen.queryByRole('tab', { name: 'Add to Seeking' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remove' }));

    await waitFor(() => expect(mockSaveDeck).toHaveBeenCalledTimes(1));
    const saved = mockSaveDeck.mock.calls[0]![0]!;
    expect(saved.formalSwapEntries).toHaveLength(0);
    expect(saved.cards.find((c) => c.instanceId === 'in1')).toBeUndefined();
    const outCard = saved.cards.find((c) => c.instanceId === 'out1')!;
    expect(outCard.primaryCategory).toBe('Other');
  });

  it('finalizes a complete pair from the edit modal', async () => {
    const deck = pairDeck();
    deck.formalSwapEntries[0]!.inTargetCategory = 'Other';
    mockLoadSwapWantSources.mockResolvedValue({
      decks: [deck],
      sources: aggregateSwapWants([deck]),
    });
    const user = userEvent.setup();
    render(<SwapQueueApp entryPath="swap-queue" />);

    await waitFor(() => expect(document.querySelector('.db-swap-pair')).toBeTruthy());
    await user.click(document.querySelector('.db-swap-pair')!);

    await waitFor(() =>
      expect(screen.getByRole('dialog', { name: 'Edit swap' })).toBeInTheDocument(),
    );
    const finalize = screen.getByRole('button', { name: 'Finalize' });
    expect(finalize).toBeEnabled();
    await user.click(finalize);

    const confirm = await screen.findByTestId('swap-finalize-confirm');
    expect(confirm).toHaveTextContent(/Remove “Cut Card” from the deck and keep “Sol Ring” in Other/);
    await user.click(within(confirm).getByRole('button', { name: 'Finalize' }));

    await waitFor(() => expect(mockSaveDeck).toHaveBeenCalledTimes(1));
    const saved = mockSaveDeck.mock.calls[0]![0]!;
    expect(saved.formalSwapEntries).toHaveLength(0);
    expect(saved.cards.find((c) => c.instanceId === 'out1')).toBeUndefined();
    const inCard = saved.cards.find((c) => c.instanceId === 'in1')!;
    expect(inCard.primaryCategory).toBe('Other');
  });

  it('finalizes a complete pair from the tile Finalize control', async () => {
    const deck = pairDeck();
    deck.formalSwapEntries[0]!.inTargetCategory = 'Other';
    mockLoadSwapWantSources.mockResolvedValue({
      decks: [deck],
      sources: aggregateSwapWants([deck]),
    });
    const user = userEvent.setup();
    render(<SwapQueueApp entryPath="swap-queue" />);

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /Finalize swap, Commander Deck/ }),
      ).toBeInTheDocument(),
    );
    await user.click(screen.getByRole('button', { name: /Finalize swap, Commander Deck/ }));

    const confirm = await screen.findByTestId('swap-finalize-confirm');
    expect(confirm).toHaveTextContent(/Remove “Cut Card” from the deck and keep “Sol Ring” in Other/);
    await user.click(within(confirm).getByRole('button', { name: 'Finalize' }));

    await waitFor(() => expect(mockSaveDeck).toHaveBeenCalledTimes(1));
    const saved = mockSaveDeck.mock.calls[0]![0]!;
    expect(saved.formalSwapEntries).toHaveLength(0);
    expect(saved.cards.find((c) => c.instanceId === 'out1')).toBeUndefined();
    expect(saved.cards.find((c) => c.instanceId === 'in1')!.primaryCategory).toBe('Other');
  });

  it('disables Finalize in the modal when the pair is incomplete', async () => {
    const deck = pairDeck();
    deck.formalSwapEntries[0]!.inInstanceId = null;
    deck.cards = deck.cards.filter((c) => c.instanceId !== 'in1');
    mockLoadSwapWantSources.mockResolvedValue({
      decks: [deck],
      sources: aggregateSwapWants([deck]),
    });
    const user = userEvent.setup();
    render(<SwapQueueApp entryPath="swap-queue" />);

    await waitFor(() => expect(document.querySelector('.db-swap-pair')).toBeTruthy());
    expect(
      screen.queryByRole('button', { name: /Finalize swap, Commander Deck/ }),
    ).not.toBeInTheDocument();

    await user.click(document.querySelector('.db-swap-pair')!);
    await waitFor(() =>
      expect(screen.getByRole('dialog', { name: 'Edit swap' })).toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: 'Finalize' })).toBeDisabled();
  });

  it('autosaves notes without a Save button', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const deck = pairDeck();
    mockLoadSwapWantSources.mockResolvedValue({
      decks: [deck],
      sources: aggregateSwapWants([deck]),
    });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<SwapQueueApp entryPath="swap-queue" />);

    await waitFor(() => expect(document.querySelector('.db-swap-pair')).toBeTruthy());
    await user.click(document.querySelector('.db-swap-pair')!);
    await waitFor(() =>
      expect(screen.getByRole('dialog', { name: 'Edit swap' })).toBeInTheDocument(),
    );
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();

    await user.type(screen.getByDisplayValue(''), 'hello notes');
    await vi.advanceTimersByTimeAsync(400);

    await waitFor(() => expect(mockSaveDeck).toHaveBeenCalled());
    const saved = mockSaveDeck.mock.calls.at(-1)![0]!;
    expect(saved.formalSwapEntries[0]!.notes).toBe('hello notes');
    expect(screen.getByRole('dialog', { name: 'Edit swap' })).toBeInTheDocument();
    vi.useRealTimers();
  });

  it('opens and highlights a pair from a deep-link hash', async () => {
    const deck = pairDeck();
    mockLoadSwapWantSources.mockResolvedValue({
      decks: [deck],
      sources: aggregateSwapWants([deck]),
    });
    window.location.hash = `#/swap-queue/${SANDBOX_USER_SLUG}/pair/${deck.deckId}/s1`;
    render(<SwapQueueApp entryPath="swap-queue" />);

    expect(await screen.findByRole('dialog', { name: 'Edit swap' })).toBeInTheDocument();
    expect(document.querySelector('.sq-pair-tile.is-highlight')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Open in Builder' })).toBeInTheDocument();
  });
});
