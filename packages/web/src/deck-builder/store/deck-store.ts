import {
  canonicalizeCategoryName,
  DeckDocumentSchema,
  toDeckSummary,
  type CategoryDef,
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

/** Rebuild cover fields from deck docs (display names, partner tiles, images). */
async function ensureLibraryCovers(summaries: DeckSummary[]): Promise<DeckSummary[]> {
  let changed = false;
  const next: DeckSummary[] = [];
  for (const s of summaries) {
    const doc = await getDeck(s.deckId);
    if (!doc) {
      next.push(s);
      continue;
    }
    const summary = toDeckSummary(doc);
    next.push(summary);
    if (
      summary.coverImageUrl !== s.coverImageUrl ||
      summary.coverImageUrlSecondary !== s.coverImageUrlSecondary ||
      summary.coverPartnerStatus !== s.coverPartnerStatus ||
      summary.coverCardName !== s.coverCardName ||
      summary.name !== s.name ||
      summary.updatedAt !== s.updatedAt ||
      summary.format !== s.format ||
      summary.archidektId !== s.archidektId
    ) {
      changed = true;
    }
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

function categoryTargetCount(categories: CategoryDef[] | undefined): number {
  return (categories || []).filter((c) => c.target != null && Number.isFinite(c.target)).length;
}

/**
 * Copy Hub-only category targets from donor onto winner when winner is missing them.
 * Used when an older API build strips `target` on PUT but still bumps updatedAt.
 */
export function overlayCategoryTargets(
  winner: DeckDocument,
  donor: DeckDocument,
): DeckDocument {
  if (categoryTargetCount(winner.categories) > 0) return winner;
  if (categoryTargetCount(donor.categories) === 0) return winner;
  const donorByName = new Map(
    (donor.categories || []).map((c) => [canonicalizeCategoryName(c.name), c]),
  );
  let changed = false;
  const categories = (winner.categories || []).map((c) => {
    if (c.target != null && Number.isFinite(c.target)) return c;
    const d = donorByName.get(canonicalizeCategoryName(c.name));
    if (d?.target == null || !Number.isFinite(d.target)) return c;
    changed = true;
    return { ...c, target: d.target };
  });
  return changed ? { ...winner, categories } : winner;
}

/** Last-write-wins merge by updatedAt (ISO strings), preserving Hub category targets. */
export function mergeDeckDocuments(
  local: DeckDocument | null,
  remote: DeckDocument | null,
): DeckDocument | null {
  if (!local) return remote;
  if (!remote) return local;
  const winner = remote.updatedAt >= local.updatedAt ? remote : local;
  const donor = winner === remote ? local : remote;
  return overlayCategoryTargets(winner, donor);
}

/** After API PUT: keep local category targets if the response dropped them. */
export function reconcileDeckAfterApiPut(
  local: DeckDocument,
  remote: DeckDocument,
): DeckDocument {
  return overlayCategoryTargets(remote, local);
}

/** Test helper */
export function __resetMemoryStoreForTests(): void {
  memoryDecks.clear();
}
