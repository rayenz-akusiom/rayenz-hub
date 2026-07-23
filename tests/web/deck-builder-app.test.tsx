import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DeckDocument, DeckSummary } from '@rayenz-hub/shared';
import { toDeckSummary } from '@rayenz-hub/shared';
import { CommanderBuilderApp } from '../../packages/web/src/deck-builder/commander/CommanderBuilderApp';
import {
  SAMPLE_COMMANDER_DECK_ID,
  SAMPLE_COMMANDER_DECK_NAME,
  SAMPLE_DISMISS_KEY,
  buildSampleCommanderDocument,
  sampleMainDeckCardCount,
} from '../../packages/web/src/deck-builder/sample/sample-deck';
import commanderFixture from '../fixtures/deck-builder/commander-slice.json';
import cubeFixture from '../fixtures/deck-builder/cube-slice.json';

const apiConfigured = vi.hoisted(() => ({ value: false }));

const listDecks = vi.fn<() => Promise<DeckSummary[]>>();
const readLibraryIndex = vi.fn<() => DeckSummary[]>();
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
  readLibraryIndex: () => readLibraryIndex(),
  getDeck: (deckId: string) => getDeck(deckId),
  saveDeck: (doc: DeckDocument) => saveDeck(doc),
  deleteDeck: (deckId: string) => deleteDeck(deckId),
  mergeDeckDocuments: (local: DeckDocument | null, remote: DeckDocument | null) =>
    mergeDeckDocuments(local, remote),
  reconcileDeckAfterApiPut: (local: DeckDocument, remote: DeckDocument) => remote,
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

vi.mock('../../packages/web/src/deck-suggest/data', () => ({
  readProfileForDeck: vi.fn(async () => null),
}));

vi.mock('../../packages/web/src/mtg/profile-sync', () => ({
  ProfileSync: {
    isConnected: vi.fn(async () => false),
    connectProfilesDir: vi.fn(async () => {}),
    readProfileYaml: vi.fn(async () => null),
  },
}));

function withLayouts(doc: DeckDocument): DeckDocument {
  return {
    ...doc,
    cardLayoutDefault: doc.cardLayoutDefault ?? 'stacked',
    cardSortDefault: doc.cardSortDefault ?? 'name_asc',
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
const sampleDoc = buildSampleCommanderDocument();

function headerAddDeckButton() {
  const header = screen.getByRole('heading', { name: /Commander Builder/ }).parentElement!;
  return within(header).getByRole('button', { name: 'Add Commander deck' });
}

function deckOpenButton(deckName: string) {
  const tile = screen.getByText(deckName, { selector: '.db-library-tile-name' }).closest('li')!;
  return within(tile).getByRole('link');
}

function defaultMocks() {
  listDecks.mockReset();
  readLibraryIndex.mockReset();
  getDeck.mockReset();
  saveDeck.mockReset();
  deleteDeck.mockReset();
  apiListDecks.mockReset();
  apiGetDeck.mockReset();
  apiPutDeck.mockReset();
  apiDeleteDeck.mockReset();
  mergeDeckDocuments.mockReset();
  listDecks.mockResolvedValue([commanderSummary, cubeSummary]);
  readLibraryIndex.mockReturnValue([commanderSummary, cubeSummary]);
  getDeck.mockImplementation(async (id) => {
    if (id === commanderDoc.deckId) return commanderDoc;
    if (id === cubeDoc.deckId) return cubeDoc;
    if (id === SAMPLE_COMMANDER_DECK_ID) return sampleDoc;
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
  window.location.hash = '';
  try {
    localStorage.removeItem(SAMPLE_DISMISS_KEY);
  } catch {
    /* ignore */
  }
});

describe('CommanderBuilderApp', () => {
  beforeEach(() => {
    defaultMocks();
    window.location.hash = '#/commander-builder';
  });

  it('shows loading then empty library state with sample deck', async () => {
    let resolveList!: (value: DeckSummary[]) => void;
    listDecks.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveList = resolve;
        }),
    );
    getDeck.mockImplementation(async (id) => {
      if (id === SAMPLE_COMMANDER_DECK_ID) return null;
      return null;
    });

    render(<CommanderBuilderApp />);
    expect(screen.getByLabelText(/loading library/i)).toBeInTheDocument();

    resolveList([]);
    await waitFor(() => {
      expect(screen.getByText(/No Commander decks saved/i)).toBeInTheDocument();
    });
    expect(screen.queryByLabelText(/loading library/i)).not.toBeInTheDocument();
    expect(screen.getByText(SAMPLE_COMMANDER_DECK_NAME, { selector: '.db-library-tile-name' })).toBeInTheDocument();
    expect(screen.getByText('Sample', { selector: '.db-sample-badge' })).toBeInTheDocument();
    expect(screen.getByText(/Or open the sample deck above/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Commander Builder/ })).toHaveTextContent('(0)');
    expect(saveDeck).toHaveBeenCalledWith(expect.objectContaining({ deckId: SAMPLE_COMMANDER_DECK_ID }));
  });

  it('lists commander decks only and hides sample when real decks exist', async () => {
    render(<CommanderBuilderApp />);

    await waitFor(() => {
      expect(screen.getByText('Fixture Commander', { selector: '.db-library-tile-name' })).toBeInTheDocument();
    });
    expect(screen.queryByText('Vintage Cube')).not.toBeInTheDocument();
    expect(screen.queryByText(SAMPLE_COMMANDER_DECK_NAME)).not.toBeInTheDocument();
    expect(screen.queryByText(/No Commander decks saved/i)).not.toBeInTheDocument();
  });

  it('shows library error when listDecks fails', async () => {
    listDecks.mockRejectedValue(new Error('IndexedDB unavailable'));

    render(<CommanderBuilderApp />);

    await waitFor(() => {
      expect(screen.getByText('IndexedDB unavailable')).toBeInTheDocument();
    });
  });

  it('opens Add deck dialog from header', async () => {
    listDecks.mockResolvedValue([]);
    const user = userEvent.setup();

    render(<CommanderBuilderApp />);
    await waitFor(() => {
      expect(screen.getByText(/No Commander decks saved/i)).toBeInTheDocument();
    });

    await user.click(headerAddDeckButton());
    expect(screen.getByRole('dialog', { name: 'Create Commander deck' })).toBeInTheDocument();
  });

  it('opens BrowseShell when a deck tile is selected', async () => {
    const user = userEvent.setup();
    render(<CommanderBuilderApp />);

    await waitFor(() => {
      expect(screen.getByText('Fixture Commander', { selector: '.db-library-tile-name' })).toBeInTheDocument();
    });

    await user.click(deckOpenButton('Fixture Commander'));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Library' })).toBeInTheDocument();
    });
    expect(screen.getByRole('heading', { name: /Fixture Commander/i })).toBeInTheDocument();
    expect(screen.getByText('Swap queue')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Deck' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('region', { name: 'Deck profile' })).not.toBeInTheDocument();
    expect(window.location.hash).toBe('#/commander-builder/default/fixture-commander');
  });

  it('opens a deck from a deep-link hash on load', async () => {
    window.location.hash = '#/commander-builder/default/fixture-commander';
    render(<CommanderBuilderApp />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Library' })).toBeInTheDocument();
    });
    expect(screen.getByRole('heading', { name: /Fixture Commander/i })).toBeInTheDocument();
    expect(getDeck).toHaveBeenCalledWith(commanderDoc.deckId);
    expect(screen.queryByLabelText(/loading library/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Opening deck/i)).not.toBeInTheDocument();
  });

  it('skips the library loading skeleton when deep-linking to a known deck', async () => {
    let resolveList!: (value: DeckSummary[]) => void;
    listDecks.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveList = resolve;
        }),
    );
    window.location.hash = '#/commander-builder/default/fixture-commander';

    render(<CommanderBuilderApp />);

    expect(screen.queryByText(/Opening deck/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/loading library/i)).not.toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Library' })).toBeInTheDocument();
    });
    expect(screen.queryByLabelText(/loading library/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Opening deck/i)).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Fixture Commander/i })).toBeInTheDocument();
    expect(getDeck).toHaveBeenCalledWith(commanderDoc.deckId);

    resolveList([commanderSummary, cubeSummary]);
    await waitFor(() => {
      expect(listDecks).toHaveBeenCalled();
    });
    expect(screen.queryByLabelText(/loading library/i)).not.toBeInTheDocument();
  });

  it('skips library skeleton while resolving an unknown deep-link slug', async () => {
    let resolveList!: (value: DeckSummary[]) => void;
    listDecks.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveList = resolve;
        }),
    );
    readLibraryIndex.mockReturnValue([]);
    window.location.hash = '#/commander-builder/default/missing-deck';

    render(<CommanderBuilderApp />);

    expect(screen.queryByText(/Opening deck/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/loading library/i)).not.toBeInTheDocument();
    expect(document.querySelector('.db-app[aria-busy="true"]')).toBeTruthy();

    resolveList([commanderSummary]);
    await waitFor(() => {
      expect(screen.getByText('Deck not found')).toBeInTheDocument();
    });
    expect(screen.getByRole('heading', { name: /Commander Builder/ })).toBeInTheDocument();
  });

  it('shows an error for an unknown deck slug deep link', async () => {
    readLibraryIndex.mockReturnValue([]);
    window.location.hash = '#/commander-builder/default/missing-deck';
    render(<CommanderBuilderApp />);

    await waitFor(() => {
      expect(screen.getByText('Deck not found')).toBeInTheDocument();
    });
    expect(screen.getByRole('heading', { name: /Commander Builder/ })).toBeInTheDocument();
  });

  it('shows an error for an unknown user slug deep link', async () => {
    window.location.hash = '#/commander-builder/other-user/fixture-commander';
    render(<CommanderBuilderApp />);

    await waitFor(() => {
      expect(screen.getByText('Unknown user “other-user”')).toBeInTheDocument();
    });
  });

  it('library tiles expose copyable deep-link hrefs', async () => {
    render(<CommanderBuilderApp />);

    await waitFor(() => {
      expect(screen.getByText('Fixture Commander', { selector: '.db-library-tile-name' })).toBeInTheDocument();
    });

    expect(deckOpenButton('Fixture Commander')).toHaveAttribute(
      'href',
      '#/commander-builder/default/fixture-commander',
    );
  });

  it('shows profile panel behind the Profile tab', async () => {
    const user = userEvent.setup();
    render(<CommanderBuilderApp />);

    await waitFor(() => {
      expect(screen.getByText('Fixture Commander', { selector: '.db-library-tile-name' })).toBeInTheDocument();
    });
    await user.click(deckOpenButton('Fixture Commander'));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Library' })).toBeInTheDocument();
    });

    expect(screen.queryByRole('region', { name: 'Deck profile' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Profile' }));
    expect(screen.getByRole('region', { name: 'Deck profile' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Swap queue' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Deck' }));
    expect(screen.getByRole('heading', { name: 'Swap queue' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Deck profile' })).not.toBeInTheDocument();
  });

  it('returns to library from BrowseShell back button', async () => {
    const user = userEvent.setup();
    render(<CommanderBuilderApp />);

    await waitFor(() => {
      expect(screen.getByText('Fixture Commander', { selector: '.db-library-tile-name' })).toBeInTheDocument();
    });
    await user.click(deckOpenButton('Fixture Commander'));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Library' })).toBeInTheDocument();
    });
    expect(window.location.hash).toBe('#/commander-builder/default/fixture-commander');

    await user.click(screen.getByRole('button', { name: 'Library' }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Commander Builder/ })).toBeInTheDocument();
    });
    expect(window.location.hash).toBe('#/commander-builder');
  });

  it('stays on library when an in-flight persist finishes after Library click', async () => {
    const user = userEvent.setup();
    let finishSave: (doc: DeckDocument) => void = () => {};
    saveDeck.mockImplementation(
      (doc) =>
        new Promise<DeckDocument>((resolve) => {
          finishSave = resolve;
        }),
    );

    render(<CommanderBuilderApp />);
    await waitFor(() => {
      expect(screen.getByText('Fixture Commander', { selector: '.db-library-tile-name' })).toBeInTheDocument();
    });
    await user.click(deckOpenButton('Fixture Commander'));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Library' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Layout/i }));
    await user.click(screen.getByRole('menuitem', { name: /Grid/i }));

    await user.click(screen.getByRole('button', { name: 'Library' }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Commander Builder/ })).toBeInTheDocument();
    });
    expect(window.location.hash).toBe('#/commander-builder');

    finishSave({
      ...commanderDoc,
      cardLayoutDefault: 'grid',
      updatedAt: new Date().toISOString(),
    });

    await new Promise((r) => setTimeout(r, 30));
    expect(screen.getByRole('heading', { name: /Commander Builder/ })).toBeInTheDocument();
    expect(window.location.hash).toBe('#/commander-builder');
    expect(screen.queryByRole('button', { name: 'Library' })).not.toBeInTheDocument();
  });

  it('stays on library when browser back clears the deck hash during a pending save', async () => {
    const user = userEvent.setup();
    let finishSave: (doc: DeckDocument) => void = () => {};
    saveDeck.mockImplementation(
      (doc) =>
        new Promise<DeckDocument>((resolve) => {
          finishSave = resolve;
        }),
    );

    render(<CommanderBuilderApp />);
    await waitFor(() => {
      expect(screen.getByText('Fixture Commander', { selector: '.db-library-tile-name' })).toBeInTheDocument();
    });
    await user.click(deckOpenButton('Fixture Commander'));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Library' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Layout/i }));
    await user.click(screen.getByRole('menuitem', { name: /Grid/i }));

    window.location.hash = '#/commander-builder';
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Commander Builder/ })).toBeInTheDocument();
    });

    finishSave({
      ...commanderDoc,
      cardLayoutDefault: 'grid',
      updatedAt: new Date().toISOString(),
    });

    await new Promise((r) => setTimeout(r, 30));
    expect(screen.getByRole('heading', { name: /Commander Builder/ })).toBeInTheDocument();
    expect(window.location.hash).toBe('#/commander-builder');
  });

  it('shows deck-not-found error when getDeck returns null', async () => {
    getDeck.mockResolvedValue(null);
    const user = userEvent.setup();

    render(<CommanderBuilderApp />);
    await waitFor(() => {
      expect(screen.getByText('Fixture Commander', { selector: '.db-library-tile-name' })).toBeInTheDocument();
    });

    await user.click(deckOpenButton('Fixture Commander'));
    await waitFor(() => {
      expect(screen.getByText('Deck not found in local store')).toBeInTheDocument();
    });
  });

  it('shows Sync from API when hub API is configured', async () => {
    apiConfigured.value = true;
    render(<CommanderBuilderApp />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Sync from API' })).toBeInTheDocument();
    });
  });

  it('keeps local decks and shows API warning after failed remote sync when browsing', async () => {
    apiConfigured.value = true;
    apiListDecks.mockRejectedValue(new Error('Remote list failed'));
    // Remote already present — open must not upload or clear the list-sync warning.
    apiGetDeck.mockResolvedValue(commanderDoc);
    const user = userEvent.setup();

    render(<CommanderBuilderApp />);
    await waitFor(() => {
      expect(screen.getByText('Fixture Commander', { selector: '.db-library-tile-name' })).toBeInTheDocument();
    });

    await user.click(deckOpenButton('Fixture Commander'));
    await waitFor(() => {
      expect(screen.getByRole('img', { name: 'Synced to Hub' })).toBeInTheDocument();
    });
    expect(screen.getByText('Remote list failed')).toBeInTheDocument();
    expect(apiPutDeck).not.toHaveBeenCalled();
  });

  it('uploads local-only deck to API when opening', async () => {
    apiConfigured.value = true;
    apiGetDeck.mockResolvedValue(null);
    const user = userEvent.setup();

    render(<CommanderBuilderApp />);
    await waitFor(() => {
      expect(screen.getByText('Fixture Commander', { selector: '.db-library-tile-name' })).toBeInTheDocument();
    });

    await user.click(deckOpenButton('Fixture Commander'));
    await waitFor(() => {
      expect(screen.getByRole('img', { name: 'Synced to Hub' })).toBeInTheDocument();
    });
    expect(apiGetDeck).toHaveBeenCalledWith(commanderDoc.deckId);
    expect(apiPutDeck).toHaveBeenCalledWith(
      expect.objectContaining({ deckId: commanderDoc.deckId, name: commanderDoc.name }),
    );
  });

  it('does not upload when opening a deck that already exists remotely', async () => {
    apiConfigured.value = true;
    apiGetDeck.mockResolvedValue(commanderDoc);
    const user = userEvent.setup();

    render(<CommanderBuilderApp />);
    await waitFor(() => {
      expect(screen.getByText('Fixture Commander', { selector: '.db-library-tile-name' })).toBeInTheDocument();
    });

    await user.click(deckOpenButton('Fixture Commander'));
    await waitFor(() => {
      expect(screen.getByRole('img', { name: 'Synced to Hub' })).toBeInTheDocument();
    });
    expect(apiGetDeck).toHaveBeenCalledWith(commanderDoc.deckId);
    expect(apiPutDeck).not.toHaveBeenCalled();
  });

  it('does not call API on open when API is not configured', async () => {
    const user = userEvent.setup();

    render(<CommanderBuilderApp />);
    await waitFor(() => {
      expect(screen.getByText('Fixture Commander', { selector: '.db-library-tile-name' })).toBeInTheDocument();
    });

    await user.click(deckOpenButton('Fixture Commander'));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Fixture Commander/i })).toBeInTheDocument();
    });
    expect(apiGetDeck).not.toHaveBeenCalled();
    expect(apiPutDeck).not.toHaveBeenCalled();
  });

  it('opens local deck and shows warning when remote GET fails', async () => {
    apiConfigured.value = true;
    apiGetDeck.mockRejectedValue(new Error('GET failed'));
    const user = userEvent.setup();

    render(<CommanderBuilderApp />);
    await waitFor(() => {
      expect(screen.getByText('Fixture Commander', { selector: '.db-library-tile-name' })).toBeInTheDocument();
    });

    await user.click(deckOpenButton('Fixture Commander'));
    await waitFor(() => {
      expect(screen.getByText('GET failed')).toBeInTheDocument();
    });
    expect(screen.getByRole('heading', { name: /Fixture Commander/i })).toBeInTheDocument();
    expect(apiPutDeck).not.toHaveBeenCalled();
  });

  it('opens local deck and shows warning when local-only PUT fails', async () => {
    apiConfigured.value = true;
    apiGetDeck.mockResolvedValue(null);
    apiPutDeck.mockRejectedValue(new Error('API sync failed'));
    const user = userEvent.setup();

    render(<CommanderBuilderApp />);
    await waitFor(() => {
      expect(screen.getByText('Fixture Commander', { selector: '.db-library-tile-name' })).toBeInTheDocument();
    });

    await user.click(deckOpenButton('Fixture Commander'));
    await waitFor(() => {
      expect(screen.getByText('API sync failed')).toBeInTheDocument();
    });
    expect(screen.getByRole('heading', { name: /Fixture Commander/i })).toBeInTheDocument();
    expect(saveDeck).toHaveBeenCalled();
  });

  it('hides sync charm when API is not configured', async () => {
    const user = userEvent.setup();

    render(<CommanderBuilderApp />);
    await waitFor(() => {
      expect(screen.getByText('Fixture Commander', { selector: '.db-library-tile-name' })).toBeInTheDocument();
    });

    await user.click(deckOpenButton('Fixture Commander'));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Fixture Commander/i })).toBeInTheDocument();
    });
    expect(screen.queryByRole('img', { name: 'Synced to Hub' })).not.toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Saved locally only' })).not.toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Hub sync failed' })).not.toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Saving to Hub…' })).not.toBeInTheDocument();
  });

  it('shows synced charm after uploading local-only deck on open', async () => {
    apiConfigured.value = true;
    apiGetDeck.mockResolvedValue(null);
    const user = userEvent.setup();

    render(<CommanderBuilderApp />);
    await waitFor(() => {
      expect(screen.getByText('Fixture Commander', { selector: '.db-library-tile-name' })).toBeInTheDocument();
    });

    await user.click(deckOpenButton('Fixture Commander'));
    await waitFor(() => {
      expect(screen.getByRole('img', { name: 'Synced to Hub' })).toBeInTheDocument();
    });
    expect(screen.queryByText('Synced to Hub')).not.toBeInTheDocument();
  });

  it('shows synced charm when opening a deck that already exists remotely', async () => {
    apiConfigured.value = true;
    apiGetDeck.mockResolvedValue(commanderDoc);
    const user = userEvent.setup();

    render(<CommanderBuilderApp />);
    await waitFor(() => {
      expect(screen.getByText('Fixture Commander', { selector: '.db-library-tile-name' })).toBeInTheDocument();
    });

    await user.click(deckOpenButton('Fixture Commander'));
    await waitFor(() => {
      expect(screen.getByRole('img', { name: 'Synced to Hub' })).toBeInTheDocument();
    });
    expect(apiPutDeck).not.toHaveBeenCalled();
    expect(screen.queryByText('Synced to Hub')).not.toBeInTheDocument();
  });

  it('shows local-only charm when open upload fails', async () => {
    apiConfigured.value = true;
    apiGetDeck.mockResolvedValue(null);
    apiPutDeck.mockRejectedValue(new Error('API sync failed'));
    const user = userEvent.setup();

    render(<CommanderBuilderApp />);
    await waitFor(() => {
      expect(screen.getByText('Fixture Commander', { selector: '.db-library-tile-name' })).toBeInTheDocument();
    });

    await user.click(deckOpenButton('Fixture Commander'));
    await waitFor(() => {
      expect(screen.getByRole('img', { name: 'Saved locally only' })).toBeInTheDocument();
    });
    expect(screen.queryByText('Saved locally only')).not.toBeInTheDocument();
  });

  it('shows error charm when remote GET fails on open', async () => {
    apiConfigured.value = true;
    apiGetDeck.mockRejectedValue(new Error('GET failed'));
    const user = userEvent.setup();

    render(<CommanderBuilderApp />);
    await waitFor(() => {
      expect(screen.getByText('Fixture Commander', { selector: '.db-library-tile-name' })).toBeInTheDocument();
    });

    await user.click(deckOpenButton('Fixture Commander'));
    await waitFor(() => {
      expect(screen.getByRole('img', { name: 'Hub sync failed' })).toBeInTheDocument();
    });
    expect(screen.queryByText('Hub sync failed')).not.toBeInTheDocument();
  });

  it('shows synced charm after a successful edit persist with API configured', async () => {
    apiConfigured.value = true;
    apiGetDeck.mockResolvedValue(commanderDoc);
    const user = userEvent.setup();

    render(<CommanderBuilderApp />);
    await waitFor(() => {
      expect(screen.getByText('Fixture Commander', { selector: '.db-library-tile-name' })).toBeInTheDocument();
    });

    await user.click(deckOpenButton('Fixture Commander'));
    await waitFor(() => {
      expect(screen.getByRole('img', { name: 'Synced to Hub' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /Layout/i }));
    await user.click(screen.getByRole('menuitem', { name: /Grid/i }));

    await waitFor(() => {
      expect(apiPutDeck).toHaveBeenCalled();
      expect(screen.getByRole('img', { name: 'Synced to Hub' })).toBeInTheDocument();
    });
  });

  it('saves locally without calling API when API is not configured', async () => {
    listDecks.mockResolvedValue([]);
    const user = userEvent.setup();

    render(<CommanderBuilderApp />);
    await waitFor(() => {
      expect(screen.getByText(/No Commander decks saved/i)).toBeInTheDocument();
    });

    await user.click(headerAddDeckButton());
    const dialog = screen.getByRole('dialog', { name: 'Create Commander deck' });
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

    render(<CommanderBuilderApp />);
    await waitFor(() => {
      expect(screen.getByText(/No Commander decks saved/i)).toBeInTheDocument();
    });

    await user.click(headerAddDeckButton());
    const dialog = screen.getByRole('dialog', { name: 'Create Commander deck' });
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
    listDecks.mockImplementation(async () =>
      saveDeck.mock.calls.length
        ? [toDeckSummary(saveDeck.mock.calls.at(-1)?.[0] as DeckDocument)]
        : [],
    );
    const user = userEvent.setup();

    render(<CommanderBuilderApp />);
    await waitFor(() => {
      expect(screen.getByText(/No Commander decks saved/i)).toBeInTheDocument();
    });

    await user.click(headerAddDeckButton());
    const dialog = screen.getByRole('dialog', { name: 'Create Commander deck' });
    await user.type(within(dialog).getByLabelText('Archidekt import text'), '[Creature]\n1 Sol Ring');
    await user.click(within(dialog).getByRole('button', { name: 'Import paste' }));

    await waitFor(() => {
      expect(screen.getByText('API sync failed')).toBeInTheDocument();
      expect(screen.getByRole('img', { name: 'Hub sync failed' })).toBeInTheDocument();
    });
    expect(screen.queryByText('Hub sync failed')).not.toBeInTheDocument();
    expect(saveDeck).toHaveBeenCalled();
  });

  it('deletes locally without API when not configured', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();

    render(<CommanderBuilderApp />);
    await waitFor(() => {
      expect(screen.getByText('Fixture Commander', { selector: '.db-library-tile-name' })).toBeInTheDocument();
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

    render(<CommanderBuilderApp />);
    await waitFor(() => {
      expect(screen.getByText('Fixture Commander', { selector: '.db-library-tile-name' })).toBeInTheDocument();
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
    const secondCommander = {
      ...commanderSummary,
      deckId: 'cmd-2',
      name: 'Second Commander',
    };
    const secondDoc = { ...commanderDoc, deckId: 'cmd-2', name: 'Second Commander' };
    listDecks.mockResolvedValue([commanderSummary, secondCommander]);
    getDeck.mockImplementation(async (id) => {
      if (id === commanderDoc.deckId) return commanderDoc;
      if (id === 'cmd-2') return secondDoc;
      return null;
    });
    // Treat both as already remote so open does not upload and clear the delete warning.
    apiGetDeck.mockImplementation(async (id) => {
      if (id === commanderDoc.deckId) return commanderDoc;
      if (id === 'cmd-2') return secondDoc;
      return null;
    });
    const user = userEvent.setup();

    render(<CommanderBuilderApp />);
    await waitFor(() => {
      expect(screen.getByText('Fixture Commander', { selector: '.db-library-tile-name' })).toBeInTheDocument();
    });

    await user.click(deckOpenButton('Fixture Commander'));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Library' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Library' }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /Commander Builder/ })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Delete Fixture Commander' }));

    await waitFor(() => {
      expect(deleteDeck).toHaveBeenCalled();
    });

    await user.click(deckOpenButton('Second Commander'));
    await waitFor(() => {
      expect(screen.getByText('API delete failed')).toBeInTheDocument();
    });
  });

  it('opens sample deck and never puts to API when Hub API is configured', async () => {
    apiConfigured.value = true;
    listDecks.mockResolvedValue([]);
    readLibraryIndex.mockReturnValue([]);
    getDeck.mockImplementation(async (id) => {
      if (id === SAMPLE_COMMANDER_DECK_ID) return sampleDoc;
      return null;
    });
    const user = userEvent.setup();

    render(<CommanderBuilderApp />);
    await waitFor(() => {
      expect(screen.getByText(SAMPLE_COMMANDER_DECK_NAME, { selector: '.db-library-tile-name' })).toBeInTheDocument();
    });

    await user.click(deckOpenButton(SAMPLE_COMMANDER_DECK_NAME));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Library' })).toBeInTheDocument();
    });
    expect(screen.getByRole('heading', { name: new RegExp(SAMPLE_COMMANDER_DECK_NAME, 'i') })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Saved locally only' })).toBeInTheDocument();
    expect(apiGetDeck).not.toHaveBeenCalled();
    expect(apiPutDeck).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /Layout/i }));
    await user.click(screen.getByRole('menuitem', { name: /Grid/i }));

    await waitFor(() => {
      expect(saveDeck).toHaveBeenCalledWith(
        expect.objectContaining({ deckId: SAMPLE_COMMANDER_DECK_ID, cardLayoutDefault: 'grid' }),
      );
    });
    expect(apiPutDeck).not.toHaveBeenCalled();
    expect(apiDeleteDeck).not.toHaveBeenCalled();
  });

  it('dismisses sample deck and keeps empty onboarding', async () => {
    listDecks.mockResolvedValue([]);
    readLibraryIndex.mockReturnValue([]);
    getDeck.mockImplementation(async (id) => {
      if (id === SAMPLE_COMMANDER_DECK_ID) return sampleDoc;
      return null;
    });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();

    render(<CommanderBuilderApp />);
    await waitFor(() => {
      expect(screen.getByText(SAMPLE_COMMANDER_DECK_NAME, { selector: '.db-library-tile-name' })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: `Dismiss sample ${SAMPLE_COMMANDER_DECK_NAME}` }));

    await waitFor(() => {
      expect(deleteDeck).toHaveBeenCalledWith(SAMPLE_COMMANDER_DECK_ID);
    });
    expect(localStorage.getItem(SAMPLE_DISMISS_KEY)).toBe('1');
    expect(apiDeleteDeck).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(screen.queryByText(SAMPLE_COMMANDER_DECK_NAME)).not.toBeInTheDocument();
      expect(screen.getByText(/No Commander decks saved/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/Or open the sample deck above/i)).not.toBeInTheDocument();
  });

  it('builds a full sample commander main deck', () => {
    expect(sampleMainDeckCardCount(sampleDoc)).toBeGreaterThanOrEqual(100);
    expect(sampleDoc.formalSwapEntries.length).toBeGreaterThanOrEqual(1);
    expect(sampleDoc.lookingForEntries.length).toBeGreaterThanOrEqual(1);
  });
});
