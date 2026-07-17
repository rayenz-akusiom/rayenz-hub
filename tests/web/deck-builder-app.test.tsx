import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DeckDocument, DeckSummary } from '@rayenz-hub/shared';
import { toDeckSummary } from '@rayenz-hub/shared';
import { DeckBuilderApp } from '../../packages/web/src/deck-builder/DeckBuilderApp';
import commanderFixture from '../fixtures/deck-builder/commander-slice.json';
import cubeFixture from '../fixtures/deck-builder/cube-slice.json';

const apiConfigured = vi.hoisted(() => ({ value: false }));

const listDecks = vi.fn<() => Promise<DeckSummary[]>>();
const getDeck = vi.fn<(deckId: string) => Promise<DeckDocument | null>>();
const saveDeck = vi.fn<(doc: DeckDocument) => Promise<DeckDocument>>();
const deleteDeck = vi.fn<(deckId: string) => Promise<void>>();
const mergeDeckDocuments = vi.fn(
  (local: DeckDocument | null, remote: DeckDocument | null) => remote ?? local,
);

const apiListDecks = vi.fn<() => Promise<DeckSummary[]>>();
const apiGetDeck = vi.fn<(deckId: string) => Promise<DeckDocument | null>>();
const apiPutDeck = vi.fn<(doc: DeckDocument) => Promise<DeckDocument>>();
const apiDeleteDeck = vi.fn<(deckId: string) => Promise<void>>();

vi.mock('../../packages/web/src/api/hub-api', () => ({
  isApiConfigured: () => apiConfigured.value,
  getHubApiConfig: () =>
    apiConfigured.value
      ? { url: 'http://127.0.0.1:3000', key: 'test-api-key', enabled: true }
      : { url: '', key: '', enabled: false },
}));

vi.mock('../../packages/web/src/deck-builder/store/deck-store', () => ({
  listDecks: () => listDecks(),
  getDeck: (deckId: string) => getDeck(deckId),
  saveDeck: (doc: DeckDocument) => saveDeck(doc),
  deleteDeck: (deckId: string) => deleteDeck(deckId),
  mergeDeckDocuments: (local: DeckDocument | null, remote: DeckDocument | null) =>
    mergeDeckDocuments(local, remote),
}));

vi.mock('../../packages/web/src/deck-builder/store/deck-api', () => ({
  apiListDecks: () => apiListDecks(),
  apiGetDeck: (deckId: string) => apiGetDeck(deckId),
  apiPutDeck: (doc: DeckDocument) => apiPutDeck(doc),
  apiDeleteDeck: (deckId: string) => apiDeleteDeck(deckId),
}));

vi.mock('../../packages/web/src/deck-builder/scryfall/useScryfallEnrich', () => ({
  useScryfallEnrich: () => ({ enriching: false }),
}));

function withLayouts(doc: DeckDocument): DeckDocument {
  return {
    ...doc,
    cardLayoutDefault: doc.cardLayoutDefault ?? 'stacked',
    cards: doc.cards.map((c) => ({
      ...c,
      layout: c.layout ?? 'normal',
      keywords: c.keywords ?? null,
      partnerWith: c.partnerWith ?? null,
      foil: c.foil ?? false,
    })),
  };
}

const commanderDoc = withLayouts(commanderFixture as DeckDocument);
const cubeDoc = withLayouts(cubeFixture as DeckDocument);
const commanderSummary = toDeckSummary(commanderDoc);
const cubeSummary = toDeckSummary(cubeDoc);

function headerAddDeckButton() {
  const header = screen.getByRole('heading', { name: 'Deck Builder' }).parentElement!;
  return within(header).getByRole('button', { name: 'Add deck' });
}

function deckOpenButton(deckName: string) {
  const tile = screen.getByText(deckName, { selector: '.db-library-tile-name' }).closest('li')!;
  return within(tile).getAllByRole('button')[0]!;
}

function defaultMocks() {
  listDecks.mockResolvedValue([commanderSummary, cubeSummary]);
  getDeck.mockImplementation(async (id) => {
    if (id === commanderDoc.deckId) return commanderDoc;
    if (id === cubeDoc.deckId) return cubeDoc;
    return null;
  });
  saveDeck.mockImplementation(async (doc) => ({ ...doc, updatedAt: new Date().toISOString() }));
  deleteDeck.mockResolvedValue(undefined);
  apiListDecks.mockResolvedValue([]);
  apiGetDeck.mockResolvedValue(null);
  apiPutDeck.mockImplementation(async (doc) => doc);
  apiDeleteDeck.mockResolvedValue(undefined);
  mergeDeckDocuments.mockImplementation((local, remote) => remote ?? local);
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  apiConfigured.value = false;
});

describe('DeckBuilderApp', () => {
  beforeEach(() => {
    defaultMocks();
  });

  it('shows loading then empty library state', async () => {
    let resolveList!: (value: DeckSummary[]) => void;
    listDecks.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveList = resolve;
        }),
    );

    render(<DeckBuilderApp />);
    expect(screen.getByText('Loading…')).toBeInTheDocument();

    resolveList([]);
    await waitFor(() => {
      expect(screen.getByText('No Hub-saved decks yet.')).toBeInTheDocument();
    });
    expect(screen.queryByText('Loading…')).not.toBeInTheDocument();
  });

  it('lists decks grouped by format', async () => {
    render(<DeckBuilderApp />);

    await waitFor(() => {
      expect(screen.getByText('Fixture Commander')).toBeInTheDocument();
    });
    expect(screen.getByText('Vintage Cube')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Commander' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Cube' })).toBeInTheDocument();
  });

  it('shows library error when listDecks fails', async () => {
    listDecks.mockRejectedValue(new Error('IndexedDB unavailable'));

    render(<DeckBuilderApp />);

    await waitFor(() => {
      expect(screen.getByText('IndexedDB unavailable')).toBeInTheDocument();
    });
  });

  it('opens Add deck dialog from header', async () => {
    listDecks.mockResolvedValue([]);
    const user = userEvent.setup();

    render(<DeckBuilderApp />);
    await waitFor(() => {
      expect(screen.getByText('No Hub-saved decks yet.')).toBeInTheDocument();
    });

    await user.click(headerAddDeckButton());
    expect(screen.getByRole('dialog', { name: 'Add deck' })).toBeInTheDocument();
  });

  it('opens BrowseShell when a deck tile is selected', async () => {
    const user = userEvent.setup();
    render(<DeckBuilderApp />);

    await waitFor(() => {
      expect(screen.getByText('Fixture Commander')).toBeInTheDocument();
    });

    await user.click(deckOpenButton('Fixture Commander'));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Library' })).toBeInTheDocument();
    });
    expect(screen.getByRole('heading', { name: /Fixture Commander/i })).toBeInTheDocument();
    expect(screen.getByText('Swap queue')).toBeInTheDocument();
  });

  it('returns to library from BrowseShell back button', async () => {
    const user = userEvent.setup();
    render(<DeckBuilderApp />);

    await waitFor(() => {
      expect(screen.getByText('Fixture Commander')).toBeInTheDocument();
    });
    await user.click(deckOpenButton('Fixture Commander'));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Library' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Library' }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Deck Builder' })).toBeInTheDocument();
    });
  });

  it('shows deck-not-found error when getDeck returns null', async () => {
    getDeck.mockResolvedValue(null);
    const user = userEvent.setup();

    render(<DeckBuilderApp />);
    await waitFor(() => {
      expect(screen.getByText('Fixture Commander')).toBeInTheDocument();
    });

    await user.click(deckOpenButton('Fixture Commander'));
    await waitFor(() => {
      expect(screen.getByText('Deck not found in local store')).toBeInTheDocument();
    });
  });

  it('shows Sync from API when hub API is configured', async () => {
    apiConfigured.value = true;
    render(<DeckBuilderApp />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Sync from API' })).toBeInTheDocument();
    });
  });

  it('keeps local decks and shows API warning after failed remote sync when browsing', async () => {
    apiConfigured.value = true;
    apiListDecks.mockRejectedValue(new Error('Remote list failed'));
    const user = userEvent.setup();

    render(<DeckBuilderApp />);
    await waitFor(() => {
      expect(screen.getByText('Fixture Commander')).toBeInTheDocument();
    });

    await user.click(deckOpenButton('Fixture Commander'));
    await waitFor(() => {
      expect(screen.getByText('Remote list failed')).toBeInTheDocument();
    });
  });

  it('saves locally without calling API when API is not configured', async () => {
    listDecks.mockResolvedValue([]);
    const user = userEvent.setup();

    render(<DeckBuilderApp />);
    await waitFor(() => {
      expect(screen.getByText('No Hub-saved decks yet.')).toBeInTheDocument();
    });

    await user.click(headerAddDeckButton());
    const dialog = screen.getByRole('dialog', { name: 'Add deck' });
    await user.type(within(dialog).getByLabelText('Archidekt import text'), '[Creature]\n1 Sol Ring');
    await user.click(within(dialog).getByRole('button', { name: 'Import paste' }));

    await waitFor(() => {
      expect(saveDeck).toHaveBeenCalled();
    });
    expect(apiPutDeck).not.toHaveBeenCalled();
  });

  it('syncs save to API when configured', async () => {
    apiConfigured.value = true;
    listDecks.mockResolvedValue([]);
    saveDeck.mockImplementation(async (doc) => doc);
    getDeck.mockImplementation(async () =>
      saveDeck.mock.calls.length ? (saveDeck.mock.calls.at(-1)?.[0] as DeckDocument) : null,
    );
    const user = userEvent.setup();

    render(<DeckBuilderApp />);
    await waitFor(() => {
      expect(screen.getByText('No Hub-saved decks yet.')).toBeInTheDocument();
    });

    await user.click(headerAddDeckButton());
    const dialog = screen.getByRole('dialog', { name: 'Add deck' });
    await user.type(within(dialog).getByLabelText('Archidekt import text'), '[Creature]\n1 Sol Ring');
    await user.click(within(dialog).getByRole('button', { name: 'Import paste' }));

    await waitFor(() => {
      expect(apiPutDeck).toHaveBeenCalled();
    });
  });

  it('shows API warning when save succeeds locally but API put fails', async () => {
    apiConfigured.value = true;
    listDecks.mockResolvedValue([]);
    apiPutDeck.mockRejectedValue(new Error('API sync failed'));
    getDeck.mockImplementation(async () =>
      saveDeck.mock.calls.length ? (saveDeck.mock.calls.at(-1)?.[0] as DeckDocument) : null,
    );
    const user = userEvent.setup();

    render(<DeckBuilderApp />);
    await waitFor(() => {
      expect(screen.getByText('No Hub-saved decks yet.')).toBeInTheDocument();
    });

    await user.click(headerAddDeckButton());
    const dialog = screen.getByRole('dialog', { name: 'Add deck' });
    await user.type(within(dialog).getByLabelText('Archidekt import text'), '[Creature]\n1 Sol Ring');
    await user.click(within(dialog).getByRole('button', { name: 'Import paste' }));

    await waitFor(() => {
      expect(screen.getByText('API sync failed')).toBeInTheDocument();
    });
    expect(saveDeck).toHaveBeenCalled();
  });

  it('deletes locally without API when not configured', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();

    render(<DeckBuilderApp />);
    await waitFor(() => {
      expect(screen.getByText('Fixture Commander')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Delete Fixture Commander' }));

    await waitFor(() => {
      expect(deleteDeck).toHaveBeenCalledWith(commanderDoc.deckId);
    });
    expect(apiDeleteDeck).not.toHaveBeenCalled();
  });

  it('calls API delete when configured', async () => {
    apiConfigured.value = true;
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();

    render(<DeckBuilderApp />);
    await waitFor(() => {
      expect(screen.getByText('Fixture Commander')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Delete Fixture Commander' }));

    await waitFor(() => {
      expect(apiDeleteDeck).toHaveBeenCalledWith(commanderDoc.deckId);
    });
    expect(deleteDeck).toHaveBeenCalledWith(commanderDoc.deckId);
  });

  it('shows API warning when delete succeeds locally but API delete fails', async () => {
    apiConfigured.value = true;
    apiDeleteDeck.mockRejectedValue(new Error('API delete failed'));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();

    render(<DeckBuilderApp />);
    await waitFor(() => {
      expect(screen.getByText('Fixture Commander')).toBeInTheDocument();
    });

    await user.click(deckOpenButton('Fixture Commander'));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Library' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Library' }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Deck Builder' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Delete Fixture Commander' }));

    await waitFor(() => {
      expect(deleteDeck).toHaveBeenCalled();
    });

    await user.click(deckOpenButton('Vintage Cube'));
    await waitFor(() => {
      expect(screen.getByText('API delete failed')).toBeInTheDocument();
    });
  });
});
