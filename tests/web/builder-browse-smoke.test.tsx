import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DeckDocument, DeckSummary } from '@rayenz-hub/shared';
import { toDeckSummary } from '@rayenz-hub/shared';
import { CommanderBuilderApp } from '../../packages/web/src/deck-builder/commander/CommanderBuilderApp';
import { CubeBuilderApp } from '../../packages/web/src/deck-builder/cube/CubeBuilderApp';
import commanderFixture from '../fixtures/deck-builder/commander-slice.json';
import cubeFixture from '../fixtures/deck-builder/cube-slice.json';

const listDecks = vi.fn<() => Promise<DeckSummary[]>>();
const readLibraryIndex = vi.fn<() => DeckSummary[]>();
const getDeck = vi.fn<(deckId: string) => Promise<DeckDocument | null>>();
const saveDeck = vi.fn<(doc: DeckDocument) => Promise<DeckDocument>>();
const deleteDeck = vi.fn<(deckId: string) => Promise<void>>();

vi.mock('../../packages/web/src/api/hub-api', () => ({
  isApiConfigured: () => false,
  getHubApiConfig: () => ({ url: '', key: '', enabled: false }),
  loadDeckBuilderSettings: async () => ({ settings: null, source: 'defaults' }),
}));

vi.mock('../../packages/web/src/deck-builder/store/deck-store', () => ({
  listDecks: () => listDecks(),
  readLibraryIndex: () => readLibraryIndex(),
  getDeck: (deckId: string) => getDeck(deckId),
  saveDeck: (doc: DeckDocument) => saveDeck(doc),
  deleteDeck: (deckId: string) => deleteDeck(deckId),
  mergeDeckDocuments: (local: DeckDocument | null, remote: DeckDocument | null) => remote ?? local,
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

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.location.hash = '';
});

describe('builder browse smoke', () => {
  beforeEach(() => {
    const summaries = [toDeckSummary(commanderDoc), toDeckSummary(cubeDoc)];
    listDecks.mockResolvedValue(summaries);
    readLibraryIndex.mockReturnValue(summaries);
    getDeck.mockImplementation(async (id) => {
      if (id === commanderDoc.deckId) return commanderDoc;
      if (id === cubeDoc.deckId) return cubeDoc;
      return null;
    });
    saveDeck.mockImplementation(async (doc) => doc);
    deleteDeck.mockResolvedValue(undefined);
  });

  it('opens a commander deck into browse chrome from Commander Builder', async () => {
    const user = userEvent.setup();
    window.location.hash = '#/commander-builder';
    render(<CommanderBuilderApp />);

    await waitFor(() => {
      expect(screen.getByText('Fixture Commander', { selector: '.db-library-tile-name' })).toBeInTheDocument();
    });

    await user.click(screen.getByText('Fixture Commander', { selector: '.db-library-tile-name' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /back|library/i })).toBeInTheDocument();
    });
  });

  it('opens a cube deck into browse chrome from Cube Builder', async () => {
    const user = userEvent.setup();
    window.location.hash = '#/cube-builder';
    render(<CubeBuilderApp />);

    await waitFor(() => {
      expect(screen.getByText('Vintage Cube', { selector: '.db-library-tile-name' })).toBeInTheDocument();
    });

    await user.click(screen.getByText('Vintage Cube', { selector: '.db-library-tile-name' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /back|library/i })).toBeInTheDocument();
    });
  });
});
