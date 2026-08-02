import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { aggregateSwapWants, syncCardsWithFormalSwaps, type DeckDocument } from '@rayenz-hub/shared';
import { SwapQueueApp } from '../../packages/web/src/swap-queue/SwapQueueApp';

const mockLoadSwapWantSources = vi.fn();
const mockSaveDeck = vi.fn(async (doc: DeckDocument) => doc);

vi.mock('../../packages/web/src/swap-queue/aggregate', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../packages/web/src/swap-queue/aggregate')>();
  return {
    ...actual,
    loadSwapWantSources: () => mockLoadSwapWantSources(),
  };
});

vi.mock('../../packages/web/src/deck-builder/store/deck-store', () => ({
  saveDeck: (doc: DeckDocument) => mockSaveDeck(doc),
}));

vi.mock('../../packages/web/src/deck-builder/store/library-sync', () => ({
  pullRemoteLibraryUpdates: vi.fn(async () => []),
}));

vi.mock('../../packages/web/src/swap-queue/enrich-prices', () => ({
  enrichWantSourcesUsd: async (sources: unknown) => sources,
}));

function emptyLibraryDeck(id: string, name: string): DeckDocument {
  return {
    schemaVersion: 1,
    deckId: id,
    name,
    format: 'commander',
    archidektId: null,
    archidektUrl: null,
    categories: [{ name: 'Other', includedInDeck: true, includedInPrice: true, target: null }],
    cards: [],
    oracle: {},
    formalSwapEntries: [],
    lookingForEntries: [],
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

function pairDeckA(): DeckDocument {
  const base = emptyLibraryDeck('deck-a', 'Alpha Deck');
  return syncCardsWithFormalSwaps(
    {
      ...base,
      cards: [
        {
          instanceId: 'in1',
          name: 'Sol Ring',
          quantity: 1,
          primaryCategory: 'Other',
          categories: ['Other'],
          stack: null,
          setCode: null,
          collectorNumber: null,
          scryfallId: null,
          archidektCardId: null,
          foil: false,
          proxy: false,
        },
        {
          instanceId: 'out1',
          name: 'Cut Card',
          quantity: 1,
          primaryCategory: 'Other',
          categories: ['Other'],
          stack: null,
          setCode: null,
          collectorNumber: null,
          scryfallId: null,
          archidektCardId: null,
          foil: false,
          proxy: false,
        },
      ],
      formalSwapEntries: [
        {
          id: 's1',
          inInstanceId: 'in1',
          outInstanceId: 'out1',
          inTargetCategory: 'Other',
          sortIndex: 0,
          notes: null,
        },
      ],
    },
  );
}

function seekingDeckA(): DeckDocument {
  return {
    ...emptyLibraryDeck('deck-a', 'Alpha Deck'),
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
    lookingForEntries: [{ id: 'lf1', instanceId: 'c1', sortIndex: 0, notes: null }],
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('SwapQueueApp create and retarget', () => {
  it('Add → pick deck → creates empty pair and opens edit chrome', async () => {
    const deck = emptyLibraryDeck('deck-a', 'Alpha Deck');
    mockLoadSwapWantSources.mockResolvedValue({
      decks: [deck],
      sources: [],
    });
    const user = userEvent.setup();
    render(<SwapQueueApp />);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Add' })).toBeEnabled());
    await user.click(screen.getByRole('button', { name: 'Add' }));

    const picker = await screen.findByTestId('swap-queue-add-deck');
    await user.click(within(picker).getByRole('button', { name: 'Alpha Deck' }));

    await waitFor(() => expect(mockSaveDeck).toHaveBeenCalledTimes(1));
    const saved = mockSaveDeck.mock.calls[0]![0]!;
    expect(saved.formalSwapEntries).toHaveLength(1);
    expect(saved.formalSwapEntries[0]!.inInstanceId).toBeNull();
    expect(saved.formalSwapEntries[0]!.outInstanceId).toBeNull();

    await waitFor(() =>
      expect(screen.getByRole('dialog', { name: 'Edit swap' })).toBeInTheDocument(),
    );
  });

  it('retargets a formal pair to another deck and clears Out immediately', async () => {
    const a = pairDeckA();
    const b = emptyLibraryDeck('deck-b', 'Beta Deck');
    mockLoadSwapWantSources.mockResolvedValue({
      decks: [a, b],
      sources: aggregateSwapWants([a, b]),
    });
    const user = userEvent.setup();
    render(<SwapQueueApp />);

    await waitFor(() => expect(document.querySelector('.db-swap-pair')).toBeTruthy());
    await user.click(document.querySelector('.db-swap-pair')!);

    const dialog = await screen.findByRole('dialog', { name: 'Edit swap' });
    const deckSelect = within(dialog).getByLabelText('Target deck');
    await user.selectOptions(deckSelect, 'deck-b');

    await waitFor(() => expect(mockSaveDeck).toHaveBeenCalledTimes(2));
    const savedById = Object.fromEntries(
      mockSaveDeck.mock.calls.map((c) => [c[0]!.deckId, c[0]!]),
    );
    expect(savedById['deck-a']!.formalSwapEntries).toHaveLength(0);
    expect(savedById['deck-a']!.cards.some((c) => c.instanceId === 'in1')).toBe(false);
    expect(savedById['deck-a']!.cards.find((c) => c.name === 'Cut Card')?.primaryCategory).not.toBe(
      'Queued Out',
    );
    expect(savedById['deck-b']!.formalSwapEntries).toHaveLength(1);
    expect(savedById['deck-b']!.formalSwapEntries[0]!.outInstanceId).toBeNull();
    expect(savedById['deck-b']!.formalSwapEntries[0]!.inInstanceId).toBeTruthy();

    // Dialog stays open on the new deck with Out cleared.
    await waitFor(() =>
      expect(screen.getByRole('dialog', { name: 'Edit swap' })).toBeInTheDocument(),
    );
    expect(within(dialog).getByLabelText('Target deck')).toHaveValue('deck-b');
  });

  it('retargets Seeking to another deck immediately', async () => {
    const a = seekingDeckA();
    const b = emptyLibraryDeck('deck-b', 'Beta Deck');
    mockLoadSwapWantSources.mockResolvedValue({
      decks: [a, b],
      sources: aggregateSwapWants([a, b]),
    });
    const user = userEvent.setup();
    render(<SwapQueueApp />);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Counterspell/ })).toBeInTheDocument(),
    );
    await user.click(screen.getByRole('button', { name: /Counterspell/ }));

    const dialog = await screen.findByRole('dialog', { name: 'Edit Seeking' });
    const deckSelect = within(dialog).getByLabelText('Target deck');
    await user.selectOptions(deckSelect, 'deck-b');

    await waitFor(() => expect(mockSaveDeck).toHaveBeenCalledTimes(2));
    const savedById = Object.fromEntries(
      mockSaveDeck.mock.calls.map((c) => [c[0]!.deckId, c[0]!]),
    );
    expect(savedById['deck-a']!.lookingForEntries).toHaveLength(0);
    expect(savedById['deck-a']!.cards).toHaveLength(0);
    expect(savedById['deck-b']!.lookingForEntries).toHaveLength(1);
    expect(savedById['deck-b']!.cards[0]!.name).toBe('Counterspell');
    expect(savedById['deck-b']!.cards[0]!.primaryCategory).toBe('Seeking');
  });
});
