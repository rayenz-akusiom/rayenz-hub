import type { DeckDocument, DeckSummary } from '@rayenz-hub/shared';
import { deckVisibility } from '@rayenz-hub/shared';
import { isApiConfigured } from '../../api/hub-api';
import { isSignedIn } from '../../lib/hub-auth-session';
import { isSampleDeckId } from '../sample/sample-deck';
import { apiGetDeck, apiListDecks } from './deck-api';
import { deleteDeck, getDeck, listDecks } from './deck-store';
import {
  SANDBOX_DECK_TTL_MS,
  getLocalLibraryScope,
  setLocalLibraryScope,
} from './local-library-scope';

function sortSummaries(list: DeckSummary[]): DeckSummary[] {
  return [...list].sort(
    (a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.name.localeCompare(b.name),
  );
}

function isSandboxScoped(deckId: string): boolean {
  return isSampleDeckId(deckId) || getLocalLibraryScope(deckId) === 'sandbox';
}

export async function purgeExpiredSandboxDecks(
  nowMs = Date.now(),
  list?: DeckSummary[],
): Promise<DeckSummary[]> {
  const rows = list ?? (await listDecks());
  const kept: DeckSummary[] = [];
  for (const s of rows) {
    if (isSampleDeckId(s.deckId) || getLocalLibraryScope(s.deckId) !== 'sandbox') {
      kept.push(s);
      continue;
    }
    const updatedMs = Date.parse(s.updatedAt);
    if (!Number.isFinite(updatedMs) || nowMs - updatedMs < SANDBOX_DECK_TTL_MS) {
      kept.push(s);
      continue;
    }
    await deleteDeck(s.deckId);
  }
  return kept;
}

/** Local index rows for the unsigned / sandbox library (excludes account crash buffers). */
export async function listSandboxLibrary(): Promise<DeckSummary[]> {
  const list = await listDecks();
  return list.filter((s) => isSandboxScoped(s.deckId));
}

/** Unsynced signed-in copies kept locally after a failed API write. */
export async function listAccountBuffers(): Promise<DeckSummary[]> {
  const list = await listDecks();
  return list.filter((s) => !isSampleDeckId(s.deckId) && getLocalLibraryScope(s.deckId) === 'account');
}

export async function listFallbackLibrary(): Promise<DeckSummary[]> {
  return isSignedIn() ? listAccountBuffers() : listSandboxLibrary();
}

/**
 * Load a library document: sandbox / unsigned stay local; signed-in account
 * decks prefer a newer local buffer, otherwise Hub API.
 */
export async function resolveLibraryDocument(deckId: string): Promise<DeckDocument | null> {
  const local = await getDeck(deckId);
  if (isSampleDeckId(deckId)) return local;
  if (!isApiConfigured()) return local;
  if (local && getLocalLibraryScope(deckId) === 'sandbox') return local;
  try {
    const remote = await apiGetDeck(deckId);
    if (local && (!remote || local.updatedAt > remote.updatedAt)) return local;
    return remote ?? local;
  } catch {
    return local;
  }
}

async function dropSyncedLocalCopies(remote: DeckSummary[]): Promise<void> {
  const local = await listDecks();
  const remoteById = new Map(remote.map((r) => [r.deckId, r]));
  for (const s of local) {
    if (isSampleDeckId(s.deckId)) continue;
    const r = remoteById.get(s.deckId);
    if (!r) continue;
    if (s.updatedAt > r.updatedAt) {
      setLocalLibraryScope(s.deckId, 'account');
      continue;
    }
    await deleteDeck(s.deckId);
  }
}

function overlayPrivateVisibility(remote: DeckSummary, local?: DeckSummary): DeckSummary {
  if (deckVisibility(local) === 'private' && deckVisibility(remote) !== 'private') {
    return { ...remote, visibility: 'private' };
  }
  return remote;
}

function mergeRemoteWithAccountBuffers(
  remote: DeckSummary[],
  localAll: DeckSummary[],
): DeckSummary[] {
  const localById = new Map(localAll.map((s) => [s.deckId, s]));
  const byId = new Map(
    remote.map((r) => [r.deckId, overlayPrivateVisibility(r, localById.get(r.deckId))]),
  );
  for (const s of localAll) {
    if (isSampleDeckId(s.deckId)) continue;
    if (getLocalLibraryScope(s.deckId) !== 'account') continue;
    const r = byId.get(s.deckId);
    if (!r || s.updatedAt > r.updatedAt) {
      byId.set(s.deckId, s);
    }
  }
  return sortSummaries([...byId.values()]);
}

/**
 * Reconcile local IndexedDB with Hub API when signed in.
 * Sandbox decks stay local (and expire after 30 days). Account copies are
 * dropped after a successful sync. Throws if a signed-in API call fails.
 */
export async function pullRemoteLibraryUpdates(): Promise<DeckSummary[]> {
  const local = await listDecks();
  const remaining = await purgeExpiredSandboxDecks(Date.now(), local);

  if (!isApiConfigured()) {
    return remaining.filter((s) => isSandboxScoped(s.deckId));
  }

  const remote = await apiListDecks();
  await dropSyncedLocalCopies(remote);
  return mergeRemoteWithAccountBuffers(remote, await listDecks());
}
