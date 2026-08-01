import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DeckDocument, DeckSummary } from '@rayenz-hub/shared';
import { toDeckSummary } from '@rayenz-hub/shared';
import commander from '../../fixtures/deck-builder/commander-slice.json';
import { pullRemoteLibraryUpdates } from '../../../packages/web/src/deck-builder/store/library-sync.ts';

const apiConfigured = vi.hoisted(() => ({ value: false }));

const listDecks = vi.fn<() => Promise<DeckSummary[]>>();
const getDeck = vi.fn<(deckId: string) => Promise<DeckDocument | null>>();
const saveDeck = vi.fn<(doc: DeckDocument) => Promise<DeckDocument>>();
const mergeDeckDocuments = vi.fn(
  (local: DeckDocument | null, remote: DeckDocument | null) => remote ?? local,
);

const apiListDecks = vi.fn<() => Promise<DeckSummary[]>>();
const apiGetDeck = vi.fn<(deckId: string) => Promise<DeckDocument | null>>();

vi.mock('../../../packages/web/src/api/hub-api', () => ({
  isApiConfigured: () => apiConfigured.value,
}));

vi.mock('../../../packages/web/src/deck-builder/store/deck-store', () => ({
  listDecks: () => listDecks(),
  getDeck: (deckId: string) => getDeck(deckId),
  saveDeck: (doc: DeckDocument) => saveDeck(doc),
  mergeDeckDocuments: (local: DeckDocument | null, remote: DeckDocument | null) =>
    mergeDeckDocuments(local, remote),
}));

vi.mock('../../../packages/web/src/deck-builder/store/deck-api', () => ({
  apiListDecks: () => apiListDecks(),
  apiGetDeck: (deckId: string) => apiGetDeck(deckId),
}));

describe('pullRemoteLibraryUpdates', () => {
  const localDoc = {
    ...commander,
    updatedAt: '2026-01-01T00:00:00.000Z',
  } as DeckDocument;
  const remoteDoc = {
    ...commander,
    name: 'Remote Commander',
    updatedAt: '2026-07-01T00:00:00.000Z',
    formalSwapEntries: [
      {
        id: 's1',
        inInstanceId: 'c1',
        outInstanceId: 'c3',
        inTargetCategory: 'Creature',
        sortIndex: 0,
        notes: null,
      },
    ],
  } as DeckDocument;

  beforeEach(() => {
    apiConfigured.value = false;
    listDecks.mockReset();
    getDeck.mockReset();
    saveDeck.mockReset();
    mergeDeckDocuments.mockReset();
    mergeDeckDocuments.mockImplementation((local, remote) => remote ?? local);
    apiListDecks.mockReset();
    apiGetDeck.mockReset();
    listDecks.mockResolvedValue([toDeckSummary(localDoc)]);
    getDeck.mockResolvedValue(localDoc);
    saveDeck.mockImplementation(async (doc) => doc);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns local list without calling API when not configured', async () => {
    const list = await pullRemoteLibraryUpdates();
    expect(list).toEqual([toDeckSummary(localDoc)]);
    expect(apiListDecks).not.toHaveBeenCalled();
    expect(saveDeck).not.toHaveBeenCalled();
  });

  it('fetches and saves newer remote decks when API is configured', async () => {
    apiConfigured.value = true;
    apiListDecks.mockResolvedValue([toDeckSummary(remoteDoc)]);
    apiGetDeck.mockResolvedValue(remoteDoc);

    const list = await pullRemoteLibraryUpdates();

    expect(apiListDecks).toHaveBeenCalled();
    expect(apiGetDeck).toHaveBeenCalledWith(remoteDoc.deckId);
    expect(saveDeck).toHaveBeenCalledWith(remoteDoc);
    expect(list[0]?.name).toBe('Remote Commander');
    expect(list[0]?.updatedAt).toBe(remoteDoc.updatedAt);
  });

  it('skips remote decks that are older than local', async () => {
    apiConfigured.value = true;
    const olderRemote = {
      ...remoteDoc,
      name: 'Older Remote',
      updatedAt: '2025-01-01T00:00:00.000Z',
    } as DeckDocument;
    apiListDecks.mockResolvedValue([toDeckSummary(olderRemote)]);

    const list = await pullRemoteLibraryUpdates();

    expect(apiGetDeck).not.toHaveBeenCalled();
    expect(saveDeck).not.toHaveBeenCalled();
    expect(list[0]?.name).toBe(localDoc.name);
  });

  it('propagates API errors to the caller', async () => {
    apiConfigured.value = true;
    apiListDecks.mockRejectedValue(new Error('API down'));

    await expect(pullRemoteLibraryUpdates()).rejects.toThrow('API down');
  });
});
