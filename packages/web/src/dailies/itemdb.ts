/*
 * ItemDB catalog picker — official lists as catalog SoT; local acquired filters picks.
 *
 * Catalog cache: IndexedDB (rayenz-dailies) with sync memory mirror; migrates legacy localStorage.
 * Refresh meta: localStorage rayenz-itemdb-refresh-meta
 * Acquired: IndexedDB — source of truth for already done.
 *
 * Pick: first cached item not in session skip or acquired set.
 * Next item: session-only skip (re-pick until reload).
 *
 * Debug: localStorage['dailies-itemdb-debug'] = '1' for verbose picker trace.
 */

import type { DailiesWishlist } from '@rayenz-hub/shared';
import { bridgeFetch, hasItemdbBridge } from '../lib/neopets-bridge';
import {
  acquiredIidSet,
  getAcquired,
  getCatalog,
  markAcquired,
  putCatalog,
  type AcquisitionSource,
} from './acquisition-store';
import { toUriEncodedKebabCase } from './string-utils';
import type { ListCache, WishlistItem } from './types';

export type { ListCache, WishlistItem } from './types';

export const ITEMDB_DEBUG_KEY = 'dailies-itemdb-debug';
const CACHE_KEY_PREFIX = 'rayenz-itemdb-cache:';
export const REFRESH_META_KEY = 'rayenz-itemdb-refresh-meta';
/** @deprecated Removed — cleared on hydrate. */
export const BLACKLIST_KEY = 'rayenz-itemdb-blacklist';
const BLACKLIST_MIGRATED_KEY = 'rayenz-itemdb-blacklist-migrated';
const LOCAL_HIDDEN_KEY = 'rayenz-itemdb-local-hidden';
export const CACHE_FORMAT_VERSION = 2;
export const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const MIN_REFRESH_GAP_MS = 2 * 60 * 60 * 1000;
export const RATE_LIMIT_BACKOFF_MS = 30 * 60 * 1000;

const sessionSkipIds: Record<string, number[]> = {};
/** Sync mirrors hydrated from IndexedDB / localStorage migration. */
const catalogMemory = new Map<string, ListCache>();
const acquiredMemory = new Map<string, Set<number>>();

let legacyKeysCleared = false;

function clearLegacyBlacklistKeys(): void {
  if (legacyKeysCleared) {
    return;
  }
  legacyKeysCleared = true;
  try {
    localStorage.removeItem(BLACKLIST_KEY);
    localStorage.removeItem(BLACKLIST_MIGRATED_KEY);
    localStorage.removeItem(LOCAL_HIDDEN_KEY);
  } catch {
    /* ignore */
  }
}

export type RefreshMeta = {
  lastAnyRefreshAt: number;
  lastRefreshAt: Record<string, number>;
  rateLimitedUntil: number;
};

export type ListTarget = {
  list: DailiesWishlist;
  item: WishlistItem | null;
  error: string | null;
  fromCache: boolean;
  cachedAt: number | null;
  refreshed: boolean;
};

type ItemdbListRow = {
  item_iid: number;
  isHidden?: boolean | number;
};

type ItemdbItemdata = {
  internal_id: number;
  item_id?: number;
  name: string;
  image?: string;
  description?: string;
  isNC?: boolean;
  specialType?: string;
  price?: { value: number };
  findAt?: { shopWizard?: string };
};

type FetchListDataResult = {
  info: ItemdbListRow[];
  itemdata: ItemdbItemdata[];
  fetches: string[];
};

export function hasBridge(): boolean {
  return hasItemdbBridge();
}

export function hubFetch(url: string, options?: RequestInit): Promise<Response> {
  return bridgeFetch(url, options);
}

export function isItemdbDebugEnabled(): boolean {
  try {
    return localStorage.getItem(ITEMDB_DEBUG_KEY) === '1';
  } catch {
    return false;
  }
}

function storageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

export function cacheListKey(list: DailiesWishlist | null | undefined): string {
  const user = (list && list.user) || 'official';
  const slug = list && list.slug;
  return CACHE_KEY_PREFIX + encodeURIComponent(user) + ':' + encodeURIComponent(slug || '');
}

function listMemoryKey(list: DailiesWishlist | null | undefined): string {
  return (list && list.id) || cacheListKey(list);
}

/** Migrate one legacy localStorage catalog into IDB + memory. */
async function migrateLegacyListCache(list: DailiesWishlist): Promise<ListCache | null> {
  const raw = storageGet(cacheListKey(list));
  if (!raw) {
    return null;
  }
  try {
    const cache = JSON.parse(raw) as ListCache;
    if (!cache || cache.formatVersion !== CACHE_FORMAT_VERSION || !Array.isArray(cache.items)) {
      return null;
    }
    const migrated = list ? migrateCacheLocalSkips(list, cache) : cache;
    catalogMemory.set(listMemoryKey(list), migrated);
    await putCatalog({
      listId: list.id,
      formatVersion: migrated.formatVersion,
      fetchedAt: migrated.fetchedAt,
      fetches: migrated.fetches || [],
      items: migrated.items,
    });
    try {
      localStorage.removeItem(cacheListKey(list));
    } catch {
      /* ignore */
    }
    return migrated;
  } catch {
    return null;
  }
}

export async function hydrateListState(lists: DailiesWishlist[]): Promise<void> {
  clearLegacyBlacklistKeys();
  for (const list of lists) {
    if (!list?.id) {
      continue;
    }
    const fromIdb = await getCatalog(list.id);
    if (fromIdb && Array.isArray(fromIdb.items)) {
      catalogMemory.set(list.id, {
        formatVersion: fromIdb.formatVersion || CACHE_FORMAT_VERSION,
        fetchedAt: fromIdb.fetchedAt,
        fetches: fromIdb.fetches || [],
        items: fromIdb.items,
      });
    } else {
      await migrateLegacyListCache(list);
    }
    const acquired = await getAcquired(list.id);
    acquiredMemory.set(list.id, acquiredIidSet(acquired));
  }
}

export function getAcquiredIdsSync(listId: string | undefined): number[] {
  if (!listId) {
    return [];
  }
  const set = acquiredMemory.get(listId);
  return set ? Array.from(set) : [];
}

export function loadListCache(list: DailiesWishlist | null | undefined): ListCache | null {
  if (!list) {
    return null;
  }
  const mem = catalogMemory.get(listMemoryKey(list));
  if (mem && Array.isArray(mem.items)) {
    return list ? migrateCacheLocalSkips(list, mem) : mem;
  }
  // Sync fallback: legacy localStorage (pre-hydrate)
  const raw = storageGet(cacheListKey(list));
  if (!raw) {
    return null;
  }
  try {
    const cache = JSON.parse(raw) as ListCache;
    if (!cache || cache.formatVersion !== CACHE_FORMAT_VERSION || !Array.isArray(cache.items)) {
      return null;
    }
    const migrated = migrateCacheLocalSkips(list, cache);
    catalogMemory.set(listMemoryKey(list), migrated);
    return migrated;
  } catch {
    return null;
  }
}

export function stripDescriptionsFromItems(items: WishlistItem[]): WishlistItem[] {
  return items.map((item) => {
    if (!item || !item.description) {
      return item;
    }
    const trimmed: WishlistItem = { ...item };
    delete (trimmed as { description?: string | null }).description;
    return trimmed;
  });
}

function buildCachePayload(items: WishlistItem[], fetchedAt: number, fetches?: string[]): ListCache {
  return {
    formatVersion: CACHE_FORMAT_VERSION,
    fetchedAt,
    fetches: fetches || [],
    items,
  };
}

function persistListCache(list: DailiesWishlist, payload: ListCache): void {
  catalogMemory.set(listMemoryKey(list), payload);
  void putCatalog({
    listId: list.id,
    formatVersion: payload.formatVersion,
    fetchedAt: payload.fetchedAt,
    fetches: payload.fetches || [],
    items: payload.items,
  });
}

function writeListCache(list: DailiesWishlist, cache: ListCache): void {
  persistListCache(list, cache);
}

/** Drop obsolete localSkipIds from legacy cache payloads (blacklist removed). */
function migrateCacheLocalSkips(_list: DailiesWishlist, cache: ListCache): ListCache {
  if (cache && cache.localSkipIds) {
    delete cache.localSkipIds;
  }
  return cache;
}

function getSessionSkipIds(listId: string | undefined): number[] {
  if (!listId || !sessionSkipIds[listId]) {
    return [];
  }
  return sessionSkipIds[listId].slice();
}

function addSessionSkip(listId: string | undefined, itemIid: number): void {
  if (!listId || itemIid == null) {
    return;
  }
  const skips = getSessionSkipIds(listId);
  if (!skips.includes(itemIid)) {
    skips.push(itemIid);
  }
  sessionSkipIds[listId] = skips;
}

function getPickSkipIds(list: DailiesWishlist | null | undefined): number[] {
  return getSessionSkipIds(list?.id).concat(getAcquiredIdsSync(list?.id));
}

export async function markItemAcquired(
  list: DailiesWishlist,
  itemIid: number,
  source: AcquisitionSource = 'manual',
): Promise<ListTarget> {
  if (!list?.id || itemIid == null) {
    return pickNextForList(list);
  }
  await markAcquired(list.id, [itemIid], source);
  const set = acquiredMemory.get(list.id) || new Set<number>();
  set.add(itemIid);
  acquiredMemory.set(list.id, set);
  return pickNextForList(list);
}

export function syncAcquiredMemory(listId: string, iids: number[]): void {
  const set = acquiredMemory.get(listId) || new Set<number>();
  for (const iid of iids) {
    set.add(iid);
  }
  acquiredMemory.set(listId, set);
}

/** Test helper — clear sync catalog/acquired mirrors. */
export function resetItemdbMemoryForTests(): void {
  catalogMemory.clear();
  acquiredMemory.clear();
  clearSessionSkips();
  legacyKeysCleared = false;
}

export function clearSessionSkips(): void {
  for (const key of Object.keys(sessionSkipIds)) {
    delete sessionSkipIds[key];
  }
}

export function saveListCache(list: DailiesWishlist, data: FetchListDataResult, fetchedAt: number): boolean {
  const normalized = normalizeWishlistFromApi(data);
  const slug = (list && list.slug) || 'wishlist';
  const payload = buildCachePayload(normalized.items, fetchedAt, data.fetches);
  try {
    persistListCache(list, payload);
    return true;
  } catch (err) {
    console.warn('[Dailies ItemDB] cache save failed for ' + slug + ':', err);
    try {
      persistListCache(
        list,
        buildCachePayload(stripDescriptionsFromItems(normalized.items), fetchedAt, data.fetches),
      );
      return true;
    } catch (err2) {
      console.warn('[Dailies ItemDB] cache save failed (no descriptions) for ' + slug + ':', err2);
      return false;
    }
  }
}

export function loadRefreshMeta(): RefreshMeta {
  const raw = storageGet(REFRESH_META_KEY);
  if (!raw) {
    return { lastAnyRefreshAt: 0, lastRefreshAt: {}, rateLimitedUntil: 0 };
  }
  try {
    const meta = JSON.parse(raw) as Partial<RefreshMeta>;
    return {
      lastAnyRefreshAt: meta.lastAnyRefreshAt || 0,
      lastRefreshAt: meta.lastRefreshAt || {},
      rateLimitedUntil: meta.rateLimitedUntil || 0,
    };
  } catch {
    return { lastAnyRefreshAt: 0, lastRefreshAt: {}, rateLimitedUntil: 0 };
  }
}

export function saveRefreshMeta(meta: RefreshMeta): void {
  storageSet(REFRESH_META_KEY, JSON.stringify(meta));
}

export function pickListToRefresh(
  lists: DailiesWishlist[],
  caches: Record<string, ListCache>,
  meta: RefreshMeta,
  now: number,
): DailiesWishlist | null {
  if (isRateLimited(meta, now)) {
    return null;
  }
  if (meta.lastAnyRefreshAt && now - meta.lastAnyRefreshAt < MIN_REFRESH_GAP_MS) {
    return null;
  }
  const due = lists
    .filter((list) => {
      const cache = caches[list.id];
      return cache && now - cache.fetchedAt >= CACHE_TTL_MS;
    })
    .sort((a, b) => caches[a.id].fetchedAt - caches[b.id].fetchedAt);
  return due.length ? due[0] : null;
}

export function isRateLimited(meta: RefreshMeta, now: number): boolean {
  return !!(meta && meta.rateLimitedUntil && now < meta.rateLimitedUntil);
}

function setRateLimitedUntil(meta: RefreshMeta, now: number): void {
  meta.rateLimitedUntil = now + RATE_LIMIT_BACKOFF_MS;
}

export function is429Error(err: { message?: string } | null | undefined): boolean {
  const message = err && err.message ? err.message : '';
  return message.indexOf('rate limit') !== -1;
}

export function pickUncachedList(
  lists: DailiesWishlist[],
  caches: Record<string, ListCache | null | undefined>,
): DailiesWishlist | null {
  for (const list of lists) {
    if (!caches[list.id]) {
      return list;
    }
  }
  return null;
}

function buildUncachedTarget(list: DailiesWishlist): ListTarget {
  return {
    list,
    item: null,
    error: 'waiting-for-cache',
    fromCache: false,
    cachedAt: null,
    refreshed: false,
  };
}

function targetFromFetchError(
  list: DailiesWishlist,
  cache: ListCache | null | undefined,
  err: Error,
  debug: boolean,
  meta: RefreshMeta,
  now: number,
): ListTarget {
  const message = err.message || 'fetch-failed';
  if (is429Error(err)) {
    setRateLimitedUntil(meta, now);
  }
  logItemdbSummary(list, cache, null, null, message);
  if (cache) {
    return buildTargetFromListData(list, cache, debug, meta, true, cache.fetchedAt, false, 'cached-fallback');
  }
  return {
    list,
    item: null,
    error: message,
    fromCache: false,
    cachedAt: null,
    refreshed: false,
  };
}

function isSkippedItemId(skipItemIds: number[], itemIid: number): boolean {
  if (!skipItemIds || !skipItemIds.length || itemIid == null) {
    return false;
  }
  return skipItemIds.indexOf(itemIid) !== -1;
}

export function itemdbErrorMessage(status: number, context: string): string {
  if (status === 401) {
    return 'ItemDB session expired — visit itemdb.com.br (log in if needed), then refresh';
  }
  if (status === 404) {
    return 'ItemDB list not found';
  }
  if (status === 429) {
    return 'ItemDB rate limit or temporary outage — wait and refresh';
  }
  if (status === 502 || status === 503 || status === 504 || status === 520) {
    return 'ItemDB temporarily unavailable — try again later';
  }
  return 'ItemDB ' + context + ' fetch failed (' + status + ')';
}

async function parseJsonArray<T>(resp: Response, context: string): Promise<T[]> {
  if (!resp.ok) {
    throw new Error(itemdbErrorMessage(resp.status, context));
  }
  const data = await resp.json();
  if (!Array.isArray(data)) {
    throw new Error('ItemDB ' + context + ' returned unexpected data');
  }
  return data as T[];
}

export function isListItemHidden(row: ItemdbListRow | null | undefined): boolean {
  if (!row) {
    return true;
  }
  return row.isHidden === true || row.isHidden === 1;
}

export function parseListItemInfo(listInfoPayload: unknown): ItemdbListRow[] | null {
  if (!Array.isArray(listInfoPayload) || !listInfoPayload[0]) {
    return null;
  }
  const itemInfo = (listInfoPayload[0] as { itemInfo?: ItemdbListRow[] }).itemInfo;
  return Array.isArray(itemInfo) ? itemInfo : null;
}

export function itemInfoHasHiddenFlags(itemInfo: ItemdbListRow[] | null): boolean {
  if (!Array.isArray(itemInfo)) {
    return false;
  }
  return itemInfo.some((row) => row && Object.prototype.hasOwnProperty.call(row, 'isHidden'));
}

export function itemInfoNeedsItemsMerge(itemInfo: ItemdbListRow[] | null): boolean {
  if (!Array.isArray(itemInfo) || itemInfo.length === 0) {
    return false;
  }
  return itemInfo.some((row) => row && !Object.prototype.hasOwnProperty.call(row, 'isHidden'));
}

export function mergeListItemRows(primary: ItemdbListRow[], secondary: ItemdbListRow[]): ItemdbListRow[] {
  if (!Array.isArray(primary) || primary.length === 0) {
    return Array.isArray(secondary) ? secondary.slice() : [];
  }
  if (!Array.isArray(secondary) || secondary.length === 0) {
    return primary.slice();
  }
  const secondaryByItemId: Record<number, ItemdbListRow> = {};
  for (const row of secondary) {
    secondaryByItemId[row.item_iid] = row;
  }
  return primary.map((row) => {
    const other = secondaryByItemId[row.item_iid];
    if (!other) {
      return row;
    }
    const hidden = isListItemHidden(row) || isListItemHidden(other);
    return { ...row, isHidden: hidden };
  });
}

async function fetchListItemRows(base: string): Promise<{ info: ItemdbListRow[]; fetches: string[] }> {
  const fetches = ['list-info'];
  const listInfoResp = await hubFetch(base);
  if (!listInfoResp.ok) {
    throw new Error(itemdbErrorMessage(listInfoResp.status, 'list info'));
  }
  const listInfoPayload = await listInfoResp.json();
  const itemInfo = parseListItemInfo(listInfoPayload);
  if (itemInfo) {
    if (itemInfoNeedsItemsMerge(itemInfo)) {
      fetches.push('items');
      const itemsResp = await hubFetch(base + '/items');
      const itemsRows = await parseJsonArray<ItemdbListRow>(itemsResp, 'items');
      return { info: mergeListItemRows(itemInfo, itemsRows), fetches };
    }
    return { info: itemInfo, fetches };
  }
  fetches.push('items');
  const fallbackResp = await hubFetch(base + '/items');
  return { info: await parseJsonArray<ItemdbListRow>(fallbackResp, 'items'), fetches };
}

async function fetchListData(list: DailiesWishlist): Promise<FetchListDataResult> {
  const user = (list && list.user) || 'rayenz';
  const slug = list && list.slug;
  if (!slug) {
    throw new Error('ItemDB list slug missing');
  }
  const base =
    'https://itemdb.com.br/api/v1/lists/' + encodeURIComponent(user) + '/' + encodeURIComponent(slug);
  const fetched = await Promise.all([
    hubFetch(base + '/itemdata').then((resp) => parseJsonArray<ItemdbItemdata>(resp, 'itemdata')),
    fetchListItemRows(base),
  ]);
  return {
    info: fetched[1].info,
    itemdata: fetched[0],
    fetches: fetched[1].fetches.concat(['itemdata']),
  };
}

function buildItemLookup(itemdata: ItemdbItemdata[]): Record<number, ItemdbItemdata> {
  const byItemId: Record<number, ItemdbItemdata> = {};
  if (!Array.isArray(itemdata)) {
    return byItemId;
  }
  for (const item of itemdata) {
    byItemId[item.internal_id] = item;
    if (item.item_id != null) {
      byItemId[item.item_id] = item;
    }
  }
  return byItemId;
}

function priceNpFromItemdata(item: ItemdbItemdata | undefined): number | null {
  if (item && item.price && typeof item.price.value === 'number') {
    return item.price.value;
  }
  return null;
}

function isEligibleForCache(_row: ItemdbListRow, item: ItemdbItemdata | undefined): boolean {
  // Catalog includes all list members; isHidden is NOT treated as acquired.
  if (!item) {
    return false;
  }
  if (item.isNC) {
    return false;
  }
  if (item.specialType && item.specialType !== 'trading') {
    return false;
  }
  return true;
}

function mapRowToWishlistItem(row: ItemdbListRow, item: ItemdbItemdata): WishlistItem {
  const shopWizardUrl = item.findAt && item.findAt.shopWizard ? item.findAt.shopWizard : null;
  return {
    itemIid: row.item_iid,
    name: item.name,
    priceNp: priceNpFromItemdata(item),
    image: item.image || null,
    shopWizardUrl,
    description: item.description || null,
  };
}

export function itemdbUrlForWishlistItem(item: WishlistItem | null | undefined): string | null {
  if (!item || !item.name) {
    return null;
  }
  return 'https://itemdb.com.br/item/' + toUriEncodedKebabCase(item.name);
}

function wishlistItemSortTier(priceNp: number | null): number {
  if (priceNp == null) {
    return 2;
  }
  if (priceNp === 0) {
    return 1;
  }
  if (priceNp > 0) {
    return 0;
  }
  return 2;
}

function compareWishlistItems(a: WishlistItem, b: WishlistItem): number {
  const tierA = wishlistItemSortTier(a.priceNp);
  const tierB = wishlistItemSortTier(b.priceNp);
  if (tierA !== tierB) {
    return tierA - tierB;
  }
  if (tierA === 0) {
    return (a.priceNp as number) - (b.priceNp as number);
  }
  return 0;
}

export function normalizeWishlistFromApi(raw: Partial<FetchListDataResult> | null | undefined): {
  items: WishlistItem[];
  fetches: string[];
} {
  const info = raw && raw.info;
  const itemdata = raw && raw.itemdata;
  if (!Array.isArray(info) || !Array.isArray(itemdata)) {
    return { items: [], fetches: raw && raw.fetches ? raw.fetches : [] };
  }
  const byItemId = buildItemLookup(itemdata);
  const items: WishlistItem[] = [];
  for (const row of info) {
    const item = byItemId[row.item_iid];
    if (!isEligibleForCache(row, item)) {
      continue;
    }
    items.push(mapRowToWishlistItem(row, item));
  }
  items.sort(compareWishlistItems);
  return { items, fetches: raw?.fetches || [] };
}

export function pickFirstWishlistItem(
  items: WishlistItem[] | null | undefined,
  options?: { skipItemIds?: number[] },
): WishlistItem | null {
  const skipItemIds = options?.skipItemIds || [];
  if (!Array.isArray(items)) {
    return null;
  }
  for (const item of items) {
    if (!isSkippedItemId(skipItemIds, item.itemIid)) {
      return item;
    }
  }
  return null;
}

/** @deprecated alias for pickFirstWishlistItem */
export const pickFirstTradeableItem = pickFirstWishlistItem;

function formatPickPriceNp(priceNp: number | null): string {
  if (priceNp == null) {
    return 'no price';
  }
  if (priceNp === 0) {
    return '0 NP';
  }
  if (priceNp > 0) {
    return priceNp.toLocaleString('en-US') + ' NP';
  }
  return 'no price';
}

export function formatCacheAgeMs(ageMs: number | null | undefined): string {
  if (ageMs == null || ageMs < 0) {
    return '';
  }
  const mins = Math.floor(ageMs / 60000);
  if (mins < 60) {
    return mins + 'm';
  }
  const hours = Math.floor(mins / 60);
  if (hours < 24) {
    return hours + 'h';
  }
  return Math.floor(hours / 24) + 'd';
}

function buildTargetFromListData(
  list: DailiesWishlist,
  cache: ListCache,
  debug: boolean,
  meta: RefreshMeta | null,
  fromCache: boolean,
  cachedAt: number | null,
  refreshed: boolean,
  logSource?: string,
): ListTarget {
  const skipItemIds = getPickSkipIds(list);
  const wishlistItem = pickFirstWishlistItem(cache.items, { skipItemIds });
  const source = logSource || (fromCache ? 'cached' : 'network');
  const cacheAge = cachedAt != null ? formatCacheAgeMs(Date.now() - cachedAt) : null;
  const fetches = fromCache ? [] : cache.fetches || [];

  if (wishlistItem) {
    console.info(
      '[Dailies ItemDB] chosen item',
      (list && list.label) || (list && list.slug) || 'wishlist',
      (list && list.slug) || '',
      JSON.stringify(wishlistItem),
    );
  }

  logItemdbSummary(list, cache, wishlistItem, fetches, null, {
    source,
    cacheAge,
    sessionSkips: getSessionSkipIds(list?.id).length,
  });
  if (debug) {
    logItemdbDebug(list, cache, wishlistItem, fetches);
  }
  return {
    list,
    item: wishlistItem,
    error: null,
    fromCache,
    cachedAt,
    refreshed,
  };
}

async function fetchAndCacheList(
  list: DailiesWishlist,
  debug: boolean,
  now: number,
  meta: RefreshMeta,
): Promise<ListTarget> {
  const data = await fetchListData(list);
  saveListCache(list, data, now);
  let cache = loadListCache(list);
  if (!cache) {
    const normalized = normalizeWishlistFromApi(data);
    cache = buildCachePayload(normalized.items, now, data.fetches);
  }
  meta.lastAnyRefreshAt = now;
  meta.lastRefreshAt[list.id] = now;
  return buildTargetFromListData(list, cache, debug, meta, false, now, true);
}

function logItemdbSummary(
  list: DailiesWishlist | null | undefined,
  cache: ListCache | null | undefined,
  wishlistItem: WishlistItem | null,
  fetches: string[] | null,
  error: string | null,
  logMeta?: {
    source?: string;
    cacheAge?: string | null;
    sessionSkips?: number;
  },
): void {
  const label = (list && list.label) || (list && list.slug) || 'wishlist';
  const slug = (list && list.slug) || '';
  const fetchNote = fetches && fetches.length ? fetches.join(' + ') : 'none';
  const meta = logMeta || {};
  if (error) {
    console.info('[Dailies ItemDB] ' + label + ' (' + slug + '): error — ' + error + ' | fetches: ' + fetchNote);
    return;
  }
  const itemCount = cache && cache.items ? cache.items.length : 0;
  const pickLabel = wishlistItem
    ? '"' + wishlistItem.name + '" ' + formatPickPriceNp(wishlistItem.priceNp)
    : 'none';
  const sourceNote = meta.source ? ' source=' + meta.source : '';
  const cacheNote = meta.cacheAge != null ? ' cacheAge=' + meta.cacheAge : '';
  const sessionNote = meta.sessionSkips != null ? ' sessionSkips=' + meta.sessionSkips : '';
  console.info(
    '[Dailies ItemDB] ' +
      label +
      ' (' +
      slug +
      '): ' +
      'items=' +
      itemCount +
      ' picked=' +
      pickLabel +
      sourceNote +
      cacheNote +
      sessionNote +
      ' | fetches: ' +
      fetchNote,
  );
}

function logItemdbDebug(
  list: DailiesWishlist | null | undefined,
  cache: ListCache,
  wishlistItem: WishlistItem | null,
  fetches: string[] | null,
): void {
  const label = (list && list.label) || (list && list.slug) || 'wishlist';
  const preview = (cache.items || []).slice(0, 10).map((item, index) => ({
    index,
    itemIid: item.itemIid,
    name: item.name,
    priceNp: item.priceNp,
    picked: wishlistItem && wishlistItem.itemIid === item.itemIid,
  }));
  console.group('[Dailies ItemDB debug] ' + label);
  console.info('fetches:', fetches);
  console.info(
    'items merge:',
    fetches && fetches.indexOf('items') !== -1 ? 'yes (partial or missing isHidden on itemInfo)' : 'no',
  );
  console.info('cached items (top 10):', preview);
  console.info('chosen:', wishlistItem);
  console.groupEnd();
}

export function pickNextForList(list: DailiesWishlist): ListTarget {
  const cache = loadListCache(list);
  if (!cache) {
    return { list, item: null, error: 'no-cache', fromCache: false, cachedAt: null, refreshed: false };
  }
  const debug = isItemdbDebugEnabled();
  return buildTargetFromListData(list, cache, debug, null, true, cache.fetchedAt, false);
}

export function skipCurrentItem(list: DailiesWishlist, itemIid: number): ListTarget {
  addSessionSkip(list?.id, itemIid);
  return pickNextForList(list);
}

export async function loadListTargets(
  lists: DailiesWishlist[],
  _settings?: unknown,
  options?: { now?: number },
): Promise<ListTarget[]> {
  const now = options?.now != null ? options.now : Date.now();

  await hydrateListState(lists);

  if (!hasBridge()) {
    return lists.map((list) => ({
      list,
      item: null,
      error: 'no-bridge',
      fromCache: false,
      cachedAt: null,
      refreshed: false,
    }));
  }

  const debug = isItemdbDebugEnabled();
  const meta = loadRefreshMeta();
  const caches: Record<string, ListCache | null> = {};

  for (const list of lists) {
    caches[list.id] = loadListCache(list);
  }

  const results = lists.map((list) => {
    const cache = caches[list.id];
    if (cache) {
      return buildTargetFromListData(list, cache, debug, meta, true, cache.fetchedAt, false);
    }
    return buildUncachedTarget(list);
  });

  if (!isRateLimited(meta, now)) {
    const toFetch = pickUncachedList(lists, caches) || pickListToRefresh(lists, caches as Record<string, ListCache>, meta, now);
    if (toFetch) {
      const fetchIndex = lists.findIndex((list) => list.id === toFetch.id);
      try {
        results[fetchIndex] = await fetchAndCacheList(toFetch, debug, now, meta);
      } catch (err) {
        results[fetchIndex] = targetFromFetchError(
          toFetch,
          caches[toFetch.id],
          err as Error,
          debug,
          meta,
          now,
        );
      }
      saveRefreshMeta(meta);
    }
  }

  return results;
}
