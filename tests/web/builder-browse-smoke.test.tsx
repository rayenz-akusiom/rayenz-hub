import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DeckDocument, DeckSummary } from '@rayenz-hub/shared';
import { toDeckSummary } from '@rayenz-hub/shared';
import { CommanderBuilderApp } from '../../packages/web/src/deck-builder/commander/CommanderBuilderApp';
import { CollectionBuilderApp } from '../../packages/web/src/deck-builder/collection/CollectionBuilderApp';
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
  getHubApiConfig: () => ({ url: '', enabled: false }),
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
  apiGetPublicDeck: vi.fn(async () => null),
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

const commanderDoc = {
  ...(commanderFixture as DeckDocument),
  updatedAt: new Date().toISOString(),
};
const cubeDoc = {
  ...(cubeFixture as DeckDocument),
  updatedAt: new Date().toISOString(),
};
const collectionDoc: DeckDocument = {
  deckId: 'collection-1',
  schemaVersion: 2,
  name: 'Planeswalker Binder',
  description: '',
  format: 'collection',
  ownership: 'owned',
  visibility: 'private',
  archidektId: null,
  archidektUrl: null,
  categories: [{ name: 'Collection', includedInDeck: true, includedInPrice: true, target: null }],
  cards: [
    {
      instanceId: 'pc1',
      name: 'Jace Beleren',
      quantity: 1,
      ownedQuantity: 0,
      inDeckQuantity: 0,
      primaryCategory: 'Collection',
      categories: ['Collection'],
      stack: null,
      setCode: 'm10',
      collectorNumber: '60',
      scryfallId: 'jace-beleren',
      archidektCardId: null,
      foil: false,
      proxy: false,
      collectionSource: 'search',
    },
  ],
  oracle: {},
  formalSwapEntries: [],
  lookingForEntries: [],
  coverInstanceId: null,
  browseViewDefault: 'all_cards',
  cardLayoutDefault: 'grid',
  cardSortDefault: 'name_asc',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  lastArchidektSyncAt: null,
  lastArchidektImportAt: null,
  cubeTargetSize: null,
  collectionTemplate: 'planeswalkers',
  collectionSearch: {
    query: 't:planeswalker',
    defaultQuantity: 1,
    lastSyncedAt: new Date().toISOString(),
    lastOpenedAt: new Date().toISOString(),
    latestReleaseDate: null,
    suppressedKeys: [],
  },
  representativeCard: null,
  autoAdjustBasics: false,
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  window.location.hash = '';
});

describe('builder browse smoke', () => {
  beforeEach(() => {
    const summaries = [toDeckSummary(commanderDoc), toDeckSummary(cubeDoc), toDeckSummary(collectionDoc)];
    listDecks.mockResolvedValue(summaries);
    readLibraryIndex.mockReturnValue(summaries);
    getDeck.mockImplementation(async (id) => {
      if (id === commanderDoc.deckId) return commanderDoc;
      if (id === cubeDoc.deckId) return cubeDoc;
      if (id === collectionDoc.deckId) return collectionDoc;
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

  it('opens a collection into browse chrome from Collection Builder', async () => {
    const user = userEvent.setup();
    window.location.hash = '#/collection-builder';
    render(<CollectionBuilderApp />);

    await waitFor(() => {
      expect(screen.getByText('Planeswalker Binder', { selector: '.db-library-tile-name' })).toBeInTheDocument();
    });

    await user.click(screen.getByText('Planeswalker Binder', { selector: '.db-library-tile-name' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /library/i })).toBeInTheDocument();
      expect(screen.getByText(/1 cards/i)).toBeInTheDocument();
    });
  });
});
