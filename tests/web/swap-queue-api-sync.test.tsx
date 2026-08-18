import './helpers/swap-queue-vi-mocks';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { aggregateSwapWants, type DeckDocument } from '@rayenz-hub/shared';
import {
  lookingForDeck,
  mockApiPutDeck,
  mockIsApiConfigured,
  mockLoadSwapWantSources,
  mockPullRemoteLibraryUpdates,
  mockSaveDeck,
  wantSource,
} from './helpers/swap-queue-harness';
import { SwapQueueApp } from '../../packages/web/src/swap-queue/SwapQueueApp';
import {
  clearHubAuthSession,
  setHubAuthSession,
} from '../../packages/web/src/lib/hub-auth-session';

vi.mock('../../packages/web/src/api/hub-api', () => ({
  isApiConfigured: () => mockIsApiConfigured(),
}));

vi.mock('../../packages/web/src/deck-builder/store/deck-api', () => ({
  apiPutDeck: (doc: DeckDocument) => mockApiPutDeck(doc),
  apiGetDeck: vi.fn(),
  apiListDecks: vi.fn(),
  apiDeleteDeck: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mockIsApiConfigured.mockReturnValue(false);
  clearHubAuthSession();
});

describe('SwapQueueApp Hub API sync', () => {
  it('pulls remote library updates on mount before loading wants', async () => {
    const order: string[] = [];
    mockPullRemoteLibraryUpdates.mockImplementation(async () => {
      order.push('pull');
    });
    mockLoadSwapWantSources.mockImplementation(async () => {
      order.push('load');
      return { decks: [], sources: [wantSource()] };
    });

    render(<SwapQueueApp entryPath="wishlist" />);

    await waitFor(() => expect(screen.getByText(/Sol Ring/)).toBeInTheDocument());
    expect(mockPullRemoteLibraryUpdates).toHaveBeenCalledTimes(1);
    expect(mockLoadSwapWantSources).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['pull', 'load']);
  });

  it('pulls again when Refresh is selected', async () => {
    mockLoadSwapWantSources.mockResolvedValue({ decks: [], sources: [wantSource()] });
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
    mockLoadSwapWantSources.mockResolvedValue({ decks: [], sources: [wantSource()] });

    render(<SwapQueueApp entryPath="wishlist" />);

    await waitFor(() => expect(screen.getByText(/Sol Ring/)).toBeInTheDocument());
    expect(screen.getByText(/Hub API unreachable/)).toBeInTheDocument();
  });

  it('pushes decks via apiPutDeck when Hub API is configured', async () => {
    mockIsApiConfigured.mockReturnValue(true);
    setHubAuthSession({ accessToken: 'token', username: 'Rayenz', sub: 'rayenz-sub' });
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
    await user.click(screen.getByRole('button', { name: 'Remove' }));

    await waitFor(() => expect(mockSaveDeck).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockApiPutDeck).toHaveBeenCalledTimes(1));
    expect(mockApiPutDeck.mock.calls[0]![0]!.lookingForEntries).toHaveLength(0);
  });
});
