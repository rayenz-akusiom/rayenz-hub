import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { aggregateSwapWants, type DeckDocument, type WantSource } from '@rayenz-hub/shared';
import { SwapQueueApp } from '../../packages/web/src/swap-queue/SwapQueueApp';

const mockLoadSwapWantSources = vi.fn();
const mockPullRemoteLibraryUpdates = vi.fn(async () => []);
const mockSaveDeck = vi.fn(async (doc: DeckDocument) => doc);
const mockApiPutDeck = vi.fn(async (doc: DeckDocument) => doc);
const mockIsApiConfigured = vi.fn(() => false);

vi.mock('../../packages/web/src/swap-queue/aggregate', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../packages/web/src/swap-queue/aggregate')>();
  return {
    ...actual,
    loadSwapWantSources: () => mockLoadSwapWantSources(),
  };
});

vi.mock('../../packages/web/src/api/hub-api', () => ({
  isApiConfigured: () => mockIsApiConfigured(),
}));

vi.mock('../../packages/web/src/deck-builder/store/deck-api', () => ({
  apiPutDeck: (doc: DeckDocument) => mockApiPutDeck(doc),
  apiGetDeck: vi.fn(),
  apiListDecks: vi.fn(),
  apiDeleteDeck: vi.fn(),
}));

vi.mock('../../packages/web/src/deck-builder/store/deck-store', () => ({
  saveDeck: (doc: DeckDocument) => mockSaveDeck(doc),
  reconcileDeckAfterApiPut: (local: DeckDocument) => local,
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

function lookingForDeck(): DeckDocument {
  return {
    schemaVersion: 1,
    deckId: 'cmd1',
    name: 'Commander Deck',
    format: 'commander',
    archidektId: null,
    archidektUrl: null,
    categories: [],
    cards: [
      {
        instanceId: 'c1',
        name: 'Counterspell',
        quantity: 1,
        primaryCategory: 'Seeking',
        categories: ['Seeking'],
        stack: null,
        setCode: null,
        collectorNumber: null,
        scryfallId: null,
        archidektCardId: null,
        foil: false,
        proxy: false,
      },
    ],
    oracle: {},
    formalSwapEntries: [],
    lookingForEntries: [{ id: 'lf1', instanceId: 'c1', sortIndex: 0, notes: null }],
    coverInstanceId: null,
    browseViewDefault: null,
    cardLayoutDefault: 'stacked',
    cardSortDefault: 'name_asc',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    lastArchidektSyncAt: null,
    lastArchidektImportAt: null,
    cubeTargetSize: null,
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mockIsApiConfigured.mockReturnValue(false);
});

describe('SwapQueueApp Hub API sync', () => {
  it('pulls remote library updates on mount before loading wants', async () => {
    const order: string[] = [];
    mockPullRemoteLibraryUpdates.mockImplementation(async () => {
      order.push('pull');
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

  it('pushes decks via apiPutDeck when Hub API is configured', async () => {
    mockIsApiConfigured.mockReturnValue(true);
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
