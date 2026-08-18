import type { DeckDocument } from '@rayenz-hub/shared';
import { isApiConfigured } from '../../api/hub-api';
import { isSignedIn } from '../../lib/hub-auth-session';
import {
  dismissSampleDeck,
  isSampleDeckId,
} from '../sample/sample-deck';
import * as deckApi from './deck-api';
import {
  getLocalLibraryScope,
  peekLocalLibraryScope,
  setLocalLibraryScope,
  type LocalLibraryScope,
} from './local-library-scope';
import * as store from './deck-store';

function resolveSaveScope(deckId: string): LocalLibraryScope {
  const existing = peekLocalLibraryScope(deckId);
  if (existing) return existing;
  const alreadyLocal = store.readLibraryIndex().some((s) => s.deckId === deckId);
  if (alreadyLocal) return 'sandbox';
  return isSignedIn() ? 'account' : 'sandbox';
}

/** Local IndexedDB save, then optional Hub API put when configured. */
export async function saveDualMode(
  doc: DeckDocument,
): Promise<{ saved: DeckDocument; apiError?: string; uploaded?: boolean }> {
  if (isSampleDeckId(doc.deckId)) {
    const saved = await store.saveDeck(doc);
    return { saved };
  }

  const scope = resolveSaveScope(doc.deckId);
  setLocalLibraryScope(doc.deckId, scope);
  const saved = await store.saveDeck(doc);

  if (scope === 'sandbox' || !isApiConfigured()) {
    return { saved };
  }

  try {
    const remote = await deckApi.apiPutDeck(saved);
    const reconciled = store.reconcileDeckAfterApiPut(saved, remote);
    await store.deleteDeck(saved.deckId);
    return { saved: reconciled, uploaded: true };
  } catch (e) {
    return { saved, apiError: e instanceof Error ? e.message : String(e) };
  }
}

/** Local delete, then optional Hub API delete when configured. */
export async function deleteDualMode(deckId: string): Promise<{ apiError?: string }> {
  const existedLocally = Boolean(
    store.readLibraryIndex().some((s) => s.deckId === deckId) || (await store.getDeck(deckId)),
  );
  const scope = getLocalLibraryScope(deckId);
  await store.deleteDeck(deckId);
  if (isSampleDeckId(deckId)) {
    dismissSampleDeck();
    return {};
  }
  if (existedLocally && scope === 'sandbox') {
    return {};
  }
  if (!isApiConfigured()) {
    return {};
  }
  try {
    await deckApi.apiDeleteDeck(deckId);
  } catch (e) {
    return { apiError: e instanceof Error ? e.message : String(e) };
  }
  return {};
}
