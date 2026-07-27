/*
 * Dailies IndexedDB: catalog caches + local acquisition sets.
 * Falls back to in-memory maps when IndexedDB is unavailable (tests).
 */

import type { WishlistItem } from './types';

const DB_NAME = 'rayenz-dailies';
const DB_VERSION = 1;
const CATALOG_STORE = 'catalog';
const ACQUIRED_STORE = 'acquired';
const META_STORE = 'meta';

export type AcquisitionSource = 'progress' | 'action' | 'manual' | 'stamp-sync';

export type AcquiredEntry = {
  acquiredAt: number;
  source: AcquisitionSource;
};

export type AcquiredDoc = {
  listId: string;
  byItemIid: Record<string, AcquiredEntry>;
};

export type CatalogDoc = {
  listId: string;
  formatVersion: number;
  fetchedAt: number;
  fetches: string[];
  items: WishlistItem[];
};

export type ProgressSyncMeta = {
  lastSyncAt?: Record<string, number>;
  stampPagesSynced?: Record<string, number>;
  unmatchedCounts?: Record<string, number>;
  acquiredCounts?: Record<string, number>;
  catalogCounts?: Record<string, number>;
  remainingCounts?: Record<string, number>;
};

const memoryCatalog = new Map<string, CatalogDoc>();
const memoryAcquired = new Map<string, AcquiredDoc>();
let memoryMeta: ProgressSyncMeta = {};

function hasIndexedDb(): boolean {
  return typeof indexedDB !== 'undefined' && indexedDB !== null;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(CATALOG_STORE)) {
        db.createObjectStore(CATALOG_STORE, { keyPath: 'listId' });
      }
      if (!db.objectStoreNames.contains(ACQUIRED_STORE)) {
        db.createObjectStore(ACQUIRED_STORE, { keyPath: 'listId' });
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: 'key' });
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

export async function getCatalog(listId: string): Promise<CatalogDoc | null> {
  if (!hasIndexedDb()) {
    return memoryCatalog.get(listId) || null;
  }
  try {
    const db = await openDb();
    const tx = db.transaction(CATALOG_STORE, 'readonly');
    const row = await idbReq(tx.objectStore(CATALOG_STORE).get(listId));
    return (row as CatalogDoc) || null;
  } catch {
    return memoryCatalog.get(listId) || null;
  }
}

export async function putCatalog(doc: CatalogDoc): Promise<void> {
  memoryCatalog.set(doc.listId, doc);
  if (!hasIndexedDb()) {
    return;
  }
  try {
    const db = await openDb();
    const tx = db.transaction(CATALOG_STORE, 'readwrite');
    await idbReq(tx.objectStore(CATALOG_STORE).put(doc));
  } catch {
    /* memory already set */
  }
}

export async function getAcquired(listId: string): Promise<AcquiredDoc> {
  const empty: AcquiredDoc = { listId, byItemIid: {} };
  if (!hasIndexedDb()) {
    return memoryAcquired.get(listId) || empty;
  }
  try {
    const db = await openDb();
    const tx = db.transaction(ACQUIRED_STORE, 'readonly');
    const row = await idbReq(tx.objectStore(ACQUIRED_STORE).get(listId));
    return (row as AcquiredDoc) || empty;
  } catch {
    return memoryAcquired.get(listId) || empty;
  }
}

export async function putAcquired(doc: AcquiredDoc): Promise<void> {
  memoryAcquired.set(doc.listId, doc);
  if (!hasIndexedDb()) {
    return;
  }
  try {
    const db = await openDb();
    const tx = db.transaction(ACQUIRED_STORE, 'readwrite');
    await idbReq(tx.objectStore(ACQUIRED_STORE).put(doc));
  } catch {
    /* memory already set */
  }
}

export async function markAcquired(
  listId: string,
  itemIids: number[],
  source: AcquisitionSource,
  acquiredAt = Date.now(),
): Promise<AcquiredDoc> {
  const doc = await getAcquired(listId);
  const next = { ...doc, byItemIid: { ...doc.byItemIid } };
  for (const iid of itemIids) {
    if (iid == null || Number.isNaN(iid)) {
      continue;
    }
    next.byItemIid[String(iid)] = { acquiredAt, source };
  }
  await putAcquired(next);
  return next;
}

export async function isAcquired(listId: string, itemIid: number): Promise<boolean> {
  const doc = await getAcquired(listId);
  return !!doc.byItemIid[String(itemIid)];
}

export function acquiredIidSet(doc: AcquiredDoc): Set<number> {
  const set = new Set<number>();
  for (const key of Object.keys(doc.byItemIid || {})) {
    const n = Number(key);
    if (!Number.isNaN(n)) {
      set.add(n);
    }
  }
  return set;
}

export async function getProgressMeta(): Promise<ProgressSyncMeta> {
  if (!hasIndexedDb()) {
    return { ...memoryMeta };
  }
  try {
    const db = await openDb();
    const tx = db.transaction(META_STORE, 'readonly');
    const row = await idbReq(tx.objectStore(META_STORE).get('progress'));
    if (row && typeof row === 'object' && 'value' in (row as object)) {
      return { ...((row as { value: ProgressSyncMeta }).value || {}) };
    }
    return { ...memoryMeta };
  } catch {
    return { ...memoryMeta };
  }
}

export async function putProgressMeta(meta: ProgressSyncMeta): Promise<void> {
  memoryMeta = { ...meta };
  if (!hasIndexedDb()) {
    return;
  }
  try {
    const db = await openDb();
    const tx = db.transaction(META_STORE, 'readwrite');
    await idbReq(tx.objectStore(META_STORE).put({ key: 'progress', value: meta }));
  } catch {
    /* memory already set */
  }
}

export async function recordListSync(
  listId: string,
  options?: {
    unmatched?: number;
    stampPageKey?: string;
    acquiredCount?: number;
    catalogCount?: number;
    remainingCount?: number;
  },
): Promise<ProgressSyncMeta> {
  const meta = await getProgressMeta();
  const now = Date.now();
  const lastSyncAt = { ...(meta.lastSyncAt || {}), [listId]: now };
  const unmatchedCounts = { ...(meta.unmatchedCounts || {}) };
  if (options?.unmatched != null) {
    unmatchedCounts[listId] = options.unmatched;
  }
  const acquiredCounts = { ...(meta.acquiredCounts || {}) };
  if (options?.acquiredCount != null) {
    acquiredCounts[listId] = options.acquiredCount;
  }
  const catalogCounts = { ...(meta.catalogCounts || {}) };
  if (options?.catalogCount != null) {
    catalogCounts[listId] = options.catalogCount;
  }
  const remainingCounts = { ...(meta.remainingCounts || {}) };
  if (options?.remainingCount != null) {
    remainingCounts[listId] = options.remainingCount;
  }
  const stampPagesSynced = { ...(meta.stampPagesSynced || {}) };
  if (options?.stampPageKey) {
    stampPagesSynced[options.stampPageKey] = now;
  }
  const next = {
    ...meta,
    lastSyncAt,
    unmatchedCounts,
    acquiredCounts,
    catalogCounts,
    remainingCounts,
    stampPagesSynced,
  };
  await putProgressMeta(next);
  return next;
}

/** Test helper — clear memory + attempt IDB wipe of stores. */
export async function resetAcquisitionStoreForTests(): Promise<void> {
  memoryCatalog.clear();
  memoryAcquired.clear();
  memoryMeta = {};
  if (!hasIndexedDb()) {
    return;
  }
  try {
    const db = await openDb();
    for (const store of [CATALOG_STORE, ACQUIRED_STORE, META_STORE]) {
      const tx = db.transaction(store, 'readwrite');
      await idbReq(tx.objectStore(store).clear());
    }
  } catch {
    /* ignore */
  }
}
