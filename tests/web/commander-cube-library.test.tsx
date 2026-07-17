import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DeckDocument, DeckSummary } from '@rayenz-hub/shared';
import { toDeckSummary } from '@rayenz-hub/shared';
import { CommanderBuilderApp } from '../../packages/web/src/deck-builder/commander/CommanderBuilderApp';
import { CubeBuilderApp } from '../../packages/web/src/deck-builder/cube/CubeBuilderApp';
import commanderFixture from '../fixtures/deck-builder/commander-slice.json';
import cubeFixture from '../fixtures/deck-builder/cube-slice.json';

const listDecks = vi.fn<() => Promise<DeckSummary[]>>();
const getDeck = vi.fn<(deckId: string) => Promise<DeckDocument | null>>();
const saveDeck = vi.fn<(doc: DeckDocument) => Promise<DeckDocument>>();
const deleteDeck = vi.fn<(deckId: string) => Promise<void>>();
const mergeDeckDocuments = vi.fn(
  (local: DeckDocument | null, remote: DeckDocument | null) => remote ?? local,
);

vi.mock('../../packages/web/src/api/hub-api', () => ({
  isApiConfigured: () => false,
  getHubApiConfig: () => ({ url: '', key: '', enabled: false }),
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
  apiListDecks: vi.fn(async () => []),
  apiGetDeck: vi.fn(async () => null),
  apiPutDeck: vi.fn(async (doc: DeckDocument) => doc),
  apiDeleteDeck: vi.fn(async () => undefined),
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

const commanderDoc = commanderFixture as DeckDocument;
const cubeDoc = cubeFixture as DeckDocument;
const commanderSummary = toDeckSummary(commanderDoc);
const cubeSummary = toDeckSummary(cubeDoc);

function defaultMocks() {
  listDecks.mockResolvedValue([commanderSummary, cubeSummary]);
  getDeck.mockImplementation(async (id) => {
    if (id === commanderDoc.deckId) return commanderDoc;
    if (id === cubeDoc.deckId) return cubeDoc;
    return null;
  });
  saveDeck.mockImplementation(async (doc) => ({ ...doc, updatedAt: new Date().toISOString() }));
  deleteDeck.mockResolvedValue(undefined);
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.location.hash = '';
});

describe('format-filtered libraries', () => {
  beforeEach(() => {
    defaultMocks();
  });

  it('Commander Builder lists only commander decks', async () => {
    window.location.hash = '#/commander-builder';
    render(<CommanderBuilderApp />);

    await waitFor(() => {
      expect(screen.getByText('Fixture Commander', { selector: '.db-library-tile-name' })).toBeInTheDocument();
    });
    expect(screen.queryByText('Vintage Cube')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Commander Builder' })).toBeInTheDocument();
  });

  it('Cube Builder lists only cube decks', async () => {
    window.location.hash = '#/cube-builder';
    render(<CubeBuilderApp />);

    await waitFor(() => {
      expect(screen.getByText('Vintage Cube', { selector: '.db-library-tile-name' })).toBeInTheDocument();
    });
    expect(screen.queryByText('Fixture Commander')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Cube Builder' })).toBeInTheDocument();
  });

  it('Commander library tiles use commander-builder deep links', async () => {
    window.location.hash = '#/commander-builder';
    render(<CommanderBuilderApp />);

    await waitFor(() => {
      expect(screen.getByText('Fixture Commander', { selector: '.db-library-tile-name' })).toBeInTheDocument();
    });

    const tile = screen.getByText('Fixture Commander', { selector: '.db-library-tile-name' }).closest('li')!;
    expect(within(tile).getByRole('link')).toHaveAttribute(
      'href',
      '#/commander-builder/default/fixture-commander',
    );
  });

  it('shows format-specific empty state in Cube Builder', async () => {
    listDecks.mockResolvedValue([commanderSummary]);
    window.location.hash = '#/cube-builder';
    render(<CubeBuilderApp />);

    await waitFor(() => {
      expect(screen.getByText(/No cube decks saved/i)).toBeInTheDocument();
    });
  });
});
