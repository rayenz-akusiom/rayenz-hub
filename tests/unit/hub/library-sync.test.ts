import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DeckDocument, DeckSummary } from '@rayenz-hub/shared';
import { toDeckSummary } from '@rayenz-hub/shared';
import commander from '../../fixtures/deck-builder/commander-slice.json';
import {
  pullRemoteLibraryUpdates,
  purgeExpiredSandboxDecks,
} from '../../../packages/web/src/deck-builder/store/library-sync.ts';
import {
  SANDBOX_DECK_TTL_MS,
  setLocalLibraryScope,
  __resetLocalLibraryScopeForTests,
} from '../../../packages/web/src/deck-builder/store/local-library-scope.ts';
import {
  clearHubAuthSession,
  setHubAuthSession,
} from '../../../packages/web/src/lib/hub-auth-session.ts';

const apiConfigured = vi.hoisted(() => ({ value: false }));

const listDecks = vi.fn<() => Promise<DeckSummary[]>>();
const getDeck = vi.fn<(deckId: string) => Promise<DeckDocument | null>>();
const saveDeck = vi.fn<(doc: DeckDocument) => Promise<DeckDocument>>();
const deleteDeck = vi.fn<(deckId: string) => Promise<void>>();

const apiListDecks = vi.fn<() => Promise<DeckSummary[]>>();
const apiGetDeck = vi.fn<(deckId: string) => Promise<DeckDocument | null>>();

vi.mock('../../../packages/web/src/api/hub-api', () => ({
  isApiConfigured: () => apiConfigured.value,
}));

vi.mock('../../../packages/web/src/deck-builder/store/deck-store', () => ({
  listDecks: () => listDecks(),
  getDeck: (deckId: string) => getDeck(deckId),
  saveDeck: (doc: DeckDocument) => saveDeck(doc),
  deleteDeck: (deckId: string) => deleteDeck(deckId),
}));

vi.mock('../../../packages/web/src/deck-builder/store/deck-api', () => ({
  apiListDecks: () => apiListDecks(),
  apiGetDeck: (deckId: string) => apiGetDeck(deckId),
}));

describe('pullRemoteLibraryUpdates', () => {
  const localDoc = {
    ...commander,
    updatedAt: '2026-08-01T00:00:00.000Z',
  } as DeckDocument;
  const remoteDoc = {
    ...commander,
    name: 'Remote Commander',
    updatedAt: '2026-08-10T00:00:00.000Z',
  } as DeckDocument;

  beforeEach(() => {
    apiConfigured.value = false;
    clearHubAuthSession();
    __resetLocalLibraryScopeForTests();
    listDecks.mockReset();
    getDeck.mockReset();
    saveDeck.mockReset();
    deleteDeck.mockReset();
    apiListDecks.mockReset();
    apiGetDeck.mockReset();
    listDecks.mockResolvedValue([toDeckSummary(localDoc)]);
    getDeck.mockResolvedValue(localDoc);
    deleteDeck.mockResolvedValue(undefined);
    saveDeck.mockImplementation(async (doc) => {
      listDecks.mockResolvedValue([toDeckSummary(doc)]);
      return doc;
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    clearHubAuthSession();
    __resetLocalLibraryScopeForTests();
  });

  it('returns sandbox local list without calling API when unsigned', async () => {
    apiConfigured.value = true;
    const list = await pullRemoteLibraryUpdates();
    expect(list).toEqual([toDeckSummary(localDoc)]);
    expect(apiListDecks).not.toHaveBeenCalled();
    expect(saveDeck).not.toHaveBeenCalled();
  });

  it('returns sandbox local list when API is not configured', async () => {
    const list = await pullRemoteLibraryUpdates();
    expect(list).toEqual([toDeckSummary(localDoc)]);
    expect(apiListDecks).not.toHaveBeenCalled();
  });

  it('returns the API list and drops local copies when signed in', async () => {
    apiConfigured.value = true;
    setHubAuthSession({ accessToken: 'token', username: 'Rayenz', sub: 'rayenz-sub' });
    apiListDecks.mockResolvedValue([toDeckSummary(remoteDoc)]);

    const list = await pullRemoteLibraryUpdates();

    expect(apiListDecks).toHaveBeenCalled();
    expect(apiGetDeck).not.toHaveBeenCalled();
    expect(saveDeck).not.toHaveBeenCalled();
    expect(deleteDeck).toHaveBeenCalledWith(localDoc.deckId);
    expect(list[0]?.name).toBe('Remote Commander');
    expect(list[0]?.updatedAt).toBe(remoteDoc.updatedAt);
  });

  it('keeps a newer local account buffer instead of dropping it', async () => {
    apiConfigured.value = true;
    setHubAuthSession({ accessToken: 'token', username: 'Rayenz', sub: 'rayenz-sub' });
    const newerLocal = {
      ...localDoc,
      name: 'Local Newer',
      updatedAt: '2026-08-20T00:00:00.000Z',
    } as DeckDocument;
    setLocalLibraryScope(newerLocal.deckId, 'account');
    listDecks.mockResolvedValue([toDeckSummary(newerLocal)]);
    const olderRemote = {
      ...remoteDoc,
      updatedAt: '2026-08-10T00:00:00.000Z',
    } as DeckDocument;
    apiListDecks.mockResolvedValue([toDeckSummary(olderRemote)]);

    const list = await pullRemoteLibraryUpdates();

    expect(deleteDeck).not.toHaveBeenCalled();
    expect(saveDeck).not.toHaveBeenCalled();
    expect(list[0]?.name).toBe('Local Newer');
  });

  it('does not include sandbox decks on the signed-in library list', async () => {
    apiConfigured.value = true;
    setHubAuthSession({ accessToken: 'token', username: 'Rayenz', sub: 'rayenz-sub' });
    const sandboxOnly = {
      ...localDoc,
      deckId: 'sandbox-only',
      name: 'Sandbox Brew',
      updatedAt: '2026-08-15T00:00:00.000Z',
    } as DeckDocument;
    setLocalLibraryScope(sandboxOnly.deckId, 'sandbox');
    listDecks.mockResolvedValue([toDeckSummary(sandboxOnly)]);
    apiListDecks.mockResolvedValue([toDeckSummary(remoteDoc)]);

    const list = await pullRemoteLibraryUpdates();

    expect(list.map((d) => d.deckId)).toEqual([remoteDoc.deckId]);
    expect(deleteDeck).not.toHaveBeenCalledWith(sandboxOnly.deckId);
  });

  it('propagates API errors to the caller when signed in', async () => {
    apiConfigured.value = true;
    setHubAuthSession({ accessToken: 'token', username: 'Rayenz', sub: 'rayenz-sub' });
    apiListDecks.mockRejectedValue(new Error('API down'));

    await expect(pullRemoteLibraryUpdates()).rejects.toThrow('API down');
  });
});

describe('purgeExpiredSandboxDecks', () => {
  const fresh = {
    ...commander,
    deckId: 'fresh-sandbox',
    updatedAt: '2026-08-10T00:00:00.000Z',
  } as DeckDocument;
  const expired = {
    ...commander,
    deckId: 'expired-sandbox',
    updatedAt: '2026-06-01T00:00:00.000Z',
  } as DeckDocument;

  beforeEach(() => {
    __resetLocalLibraryScopeForTests();
    listDecks.mockReset();
    deleteDeck.mockReset();
    deleteDeck.mockResolvedValue(undefined);
    listDecks.mockResolvedValue([toDeckSummary(fresh), toDeckSummary(expired)]);
  });

  it('deletes sandbox decks older than 30 days and keeps fresh ones', async () => {
    const now = Date.parse('2026-08-17T00:00:00.000Z');
    expect(now - Date.parse(expired.updatedAt)).toBeGreaterThan(SANDBOX_DECK_TTL_MS);
    expect(now - Date.parse(fresh.updatedAt)).toBeLessThan(SANDBOX_DECK_TTL_MS);

    await purgeExpiredSandboxDecks(now);

    expect(deleteDeck).toHaveBeenCalledWith('expired-sandbox');
    expect(deleteDeck).not.toHaveBeenCalledWith('fresh-sandbox');
  });

  it('does not purge account-scoped decks', async () => {
    setLocalLibraryScope('expired-sandbox', 'account');
    await purgeExpiredSandboxDecks(Date.parse('2026-08-17T00:00:00.000Z'));
    expect(deleteDeck).not.toHaveBeenCalledWith('expired-sandbox');
  });

  it('does not purge the sample commander', async () => {
    listDecks.mockResolvedValue([
      {
        ...toDeckSummary(expired),
        deckId: 'hub-sample-commander',
      },
    ]);
    await purgeExpiredSandboxDecks(Date.parse('2026-08-17T00:00:00.000Z'));
    expect(deleteDeck).not.toHaveBeenCalled();
  });
});
