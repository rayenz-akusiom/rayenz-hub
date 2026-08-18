/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DeckDocument } from '@rayenz-hub/shared';
import commander from '../../fixtures/deck-builder/commander-slice.json';
import {
  clearHubAuthSession,
  setHubAuthSession,
} from '../../../packages/web/src/lib/hub-auth-session.ts';
import {
  __resetLocalLibraryScopeForTests,
  getLocalLibraryScope,
  peekLocalLibraryScope,
  setLocalLibraryScope,
} from '../../../packages/web/src/deck-builder/store/local-library-scope.ts';

const apiConfigured = vi.hoisted(() => ({ value: false }));
const apiPutDeck = vi.fn<(doc: DeckDocument) => Promise<DeckDocument>>();
const apiDeleteDeck = vi.fn<(deckId: string) => Promise<void>>();

vi.mock('../../../packages/web/src/api/hub-api', () => ({
  isApiConfigured: () => apiConfigured.value,
}));

vi.mock('../../../packages/web/src/deck-builder/store/deck-api', () => ({
  apiPutDeck: (doc: DeckDocument) => apiPutDeck(doc),
  apiDeleteDeck: (deckId: string) => apiDeleteDeck(deckId),
}));

describe('saveDualMode / deleteDualMode', () => {
  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    apiConfigured.value = false;
    apiPutDeck.mockReset();
    apiDeleteDeck.mockReset();
    apiPutDeck.mockImplementation(async (doc) => doc);
    apiDeleteDeck.mockResolvedValue(undefined);
    clearHubAuthSession();
    __resetLocalLibraryScopeForTests();
    const { __resetMemoryStoreForTests } = await import(
      '../../../packages/web/src/deck-builder/store/deck-store.ts'
    );
    __resetMemoryStoreForTests();
  });

  afterEach(() => {
    clearHubAuthSession();
    __resetLocalLibraryScopeForTests();
  });

  it('keeps unsigned saves in the sandbox local store and skips API', async () => {
    const { saveDualMode } = await import(
      '../../../packages/web/src/deck-builder/store/deck-dual-mode.ts'
    );
    const { getDeck } = await import(
      '../../../packages/web/src/deck-builder/store/deck-store.ts'
    );
    apiConfigured.value = true;

    const { saved } = await saveDualMode({
      ...commander,
      deckId: 'sandbox-new',
    } as DeckDocument);

    expect(saved.deckId).toBe('sandbox-new');
    expect(getLocalLibraryScope('sandbox-new')).toBe('sandbox');
    expect(await getDeck('sandbox-new')).not.toBeNull();
    expect(apiPutDeck).not.toHaveBeenCalled();
  });

  it('uploads signed-in new decks then drops the local copy', async () => {
    const { saveDualMode } = await import(
      '../../../packages/web/src/deck-builder/store/deck-dual-mode.ts'
    );
    const { getDeck, readLibraryIndex } = await import(
      '../../../packages/web/src/deck-builder/store/deck-store.ts'
    );
    apiConfigured.value = true;
    setHubAuthSession({ accessToken: 'token', username: 'Rayenz', sub: 'rayenz-sub' });

    const { saved, uploaded, apiError } = await saveDualMode({
      ...commander,
      deckId: 'account-new',
    } as DeckDocument);

    expect(apiError).toBeUndefined();
    expect(uploaded).toBe(true);
    expect(saved.deckId).toBe('account-new');
    expect(apiPutDeck).toHaveBeenCalled();
    expect(await getDeck('account-new')).toBeNull();
    expect(readLibraryIndex().some((s) => s.deckId === 'account-new')).toBe(false);
    expect(peekLocalLibraryScope('account-new')).toBeUndefined();
  });

  it('keeps a local account buffer when PUT fails', async () => {
    const { saveDualMode } = await import(
      '../../../packages/web/src/deck-builder/store/deck-dual-mode.ts'
    );
    const { getDeck } = await import(
      '../../../packages/web/src/deck-builder/store/deck-store.ts'
    );
    apiConfigured.value = true;
    setHubAuthSession({ accessToken: 'token', username: 'Rayenz', sub: 'rayenz-sub' });
    apiPutDeck.mockRejectedValue(new Error('PUT failed'));

    const { saved, apiError, uploaded } = await saveDualMode({
      ...commander,
      deckId: 'account-fail',
    } as DeckDocument);

    expect(uploaded).toBeUndefined();
    expect(apiError).toBe('PUT failed');
    expect(getLocalLibraryScope('account-fail')).toBe('account');
    expect(await getDeck('account-fail')).not.toBeNull();
    expect(saved.deckId).toBe('account-fail');
  });

  it('does not PUT an existing sandbox deck while signed in', async () => {
    const { saveDualMode } = await import(
      '../../../packages/web/src/deck-builder/store/deck-dual-mode.ts'
    );
    const { saveDeck, getDeck } = await import(
      '../../../packages/web/src/deck-builder/store/deck-store.ts'
    );
    await saveDeck({ ...commander, deckId: 'already-local' } as DeckDocument);
    apiConfigured.value = true;
    setHubAuthSession({ accessToken: 'token', username: 'Rayenz', sub: 'rayenz-sub' });

    await saveDualMode({ ...commander, deckId: 'already-local' } as DeckDocument);

    expect(apiPutDeck).not.toHaveBeenCalled();
    expect(getLocalLibraryScope('already-local')).toBe('sandbox');
    expect(await getDeck('already-local')).not.toBeNull();
  });
});
