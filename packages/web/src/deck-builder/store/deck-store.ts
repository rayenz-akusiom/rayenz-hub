import {
  DeckDocumentSchema,
  toDeckSummary,
  type DeckDocument,
  type DeckSummary,
} from '@rayenz-hub/shared';

const DB_NAME = 'rayenz-deck-builder';
const DB_VERSION = 1;
const STORE = 'decks';
const LIBRARY_KEY = 'rayenz-deck-builder-library';

/** In-memory fallback when IndexedDB is unavailable (e.g. some test envs). */
const memoryDecks = new Map<string, DeckDocument>();

function hasIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined' && indexedDB !== null;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'deckId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
  });
}

function idbReq<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB request failed'));
  });
}

export function readLibraryIndex(): DeckSummary[] {
  try {
    const raw = localStorage.getItem(LIBRARY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLibraryIndex(summaries: DeckSummary[]): void {
  localStorage.setItem(LIBRARY_KEY, JSON.stringify(summaries));
}

function upsertSummary(doc: DeckDocument): void {
  const summary = toDeckSummary(doc);
  const list = readLibraryIndex().filter((s) => s.deckId !== doc.deckId);
  list.push(summary);
  list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.name.localeCompare(b.name));
  writeLibraryIndex(list);
}

export async function listDecks(): Promise<DeckSummary[]> {
  return ensureLibraryCovers(readLibraryIndex());
}

/** Rebuild cover fields for summaries missing them (pre-cover / pre-partner index). */
async function ensureLibraryCovers(summaries: DeckSummary[]): Promise<DeckSummary[]> {
  let changed = false;
  const next: DeckSummary[] = [];
  for (const s of summaries) {
    const hasPartnerFields = 'coverImageUrlSecondary' in s && 'coverPartnerStatus' in s;
    if (s.coverImageUrl && hasPartnerFields) {
      next.push(s);
      continue;
    }
    const doc = await getDeck(s.deckId);
    if (!doc) {
      next.push(s);
      continue;
    }
    const summary = toDeckSummary(doc);
    next.push(summary);
    changed = true;
  }
  if (changed) {
    next.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.name.localeCompare(b.name));
    writeLibraryIndex(next);
  }
  return next;
}

export async function getDeck(deckId: string): Promise<DeckDocument | null> {
  if (!hasIndexedDb()) {
    return memoryDecks.get(deckId) || null;
  }
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, 'readonly');
    const raw = await idbReq(tx.objectStore(STORE).get(deckId));
    if (!raw) return null;
    const parsed = DeckDocumentSchema.safeParse(raw);
    return parsed.success ? parsed.data : (raw as DeckDocument);
  } finally {
    db.close();
  }
}

export async function saveDeck(doc: DeckDocument): Promise<DeckDocument> {
  const now = new Date().toISOString();
  const next: DeckDocument = {
    ...doc,
    updatedAt: now,
    createdAt: doc.createdAt || now,
  };
  const validated = DeckDocumentSchema.parse(next);
  if (!hasIndexedDb()) {
    memoryDecks.set(validated.deckId, validated);
    upsertSummary(validated);
    return validated;
  }
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, 'readwrite');
    await idbReq(tx.objectStore(STORE).put(validated));
  } finally {
    db.close();
  }
  upsertSummary(validated);
  return validated;
}

export async function deleteDeck(deckId: string): Promise<void> {
  if (!hasIndexedDb()) {
    memoryDecks.delete(deckId);
    writeLibraryIndex(readLibraryIndex().filter((s) => s.deckId !== deckId));
    return;
  }
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, 'readwrite');
    await idbReq(tx.objectStore(STORE).delete(deckId));
  } finally {
    db.close();
  }
  writeLibraryIndex(readLibraryIndex().filter((s) => s.deckId !== deckId));
}

/** Last-write-wins merge by updatedAt (ISO strings). */
export function mergeDeckDocuments(
  local: DeckDocument | null,
  remote: DeckDocument | null,
): DeckDocument | null {
  if (!local) return remote;
  if (!remote) return local;
  return remote.updatedAt >= local.updatedAt ? remote : local;
}

/** Test helper */
export function __resetMemoryStoreForTests(): void {
  memoryDecks.clear();
}
