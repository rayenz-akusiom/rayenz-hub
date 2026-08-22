import './helpers/swap-queue-vi-mocks';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { mockLoadSwapWantSources, wantSource } from './helpers/swap-queue-harness';
import { SwapQueueApp } from '../../packages/web/src/swap-queue/SwapQueueApp';

const mockFetchInSetMembership = vi.fn();
const mockFetchSyntaxMembership = vi.fn();

vi.mock('@rayenz-hub/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@rayenz-hub/shared')>();
  return {
    ...actual,
    fetchInSetMembership: (...args: unknown[]) => mockFetchInSetMembership(...args),
    fetchSyntaxMembership: (...args: unknown[]) => mockFetchSyntaxMembership(...args),
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('SwapQueueApp set filter', () => {
  it('keeps a swap pair when only the Out side matches the set filter', async () => {
    mockLoadSwapWantSources.mockResolvedValue({
      decks: [],
      sources: [
        wantSource({
          kind: 'queued_in',
          entryId: 'pair-1',
          cardName: 'Ponder',
          mergeKey: 'ponder',
          cardInstanceId: 'in1',
          inInstanceId: 'in1',
          outInstanceId: 'out1',
        }),
        wantSource({
          kind: 'queued_out',
          entryId: 'pair-1',
          cardName: 'Sol Ring',
          mergeKey: 'sol ring',
          cardInstanceId: 'out1',
          inInstanceId: 'in1',
          outInstanceId: 'out1',
        }),
        wantSource({
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

    await user.click(screen.getByRole('button', { name: /^Filters/ }));
    const codesInput = screen.getByLabelText('Include set codes');
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

  it('filters seeking by Scryfall syntax and Clear restores all', async () => {
    mockLoadSwapWantSources.mockResolvedValue({
      decks: [],
      sources: [
        wantSource({
          kind: 'seeking',
          entryId: 's1',
          cardInstanceId: 'c-ponder',
          cardName: 'Ponder',
          mergeKey: 'ponder',
        }),
        wantSource({
          kind: 'seeking',
          entryId: 's2',
          cardInstanceId: 'c-sol',
          cardName: 'Sol Ring',
          mergeKey: 'sol ring',
        }),
      ],
    });
    mockFetchSyntaxMembership.mockResolvedValue(new Set(['ponder']));

    const user = userEvent.setup();
    render(<SwapQueueApp entryPath="wishlist" />);

    await waitFor(() => expect(screen.getByText(/Ponder/)).toBeInTheDocument());
    expect(screen.getByText(/Sol Ring/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Filters/ }));
    await user.type(screen.getByLabelText('Scryfall syntax'), 't:instant');
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    await waitFor(() => {
      expect(screen.queryByText(/Sol Ring/)).not.toBeInTheDocument();
    });
    expect(screen.getByText(/Ponder/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Clear' }));
    await waitFor(() => {
      expect(screen.getByText(/Sol Ring/)).toBeInTheDocument();
    });
  });
});
