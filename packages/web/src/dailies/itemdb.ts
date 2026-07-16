/*
 * ItemDB wishlist picker — custom API + localStorage cache.
 *
 * Why not embed widgets: ItemDB list widgets returned 500 during trial; the public
 * API is GET-only (no documented hide endpoint). Rate limits apply to items pulled,
 * so we fetch full lists and normalize client-side into a compact cache.
 *
 * localStorage keys:
 *   rayenz-itemdb-cache:{user}:{slug}  — v2: { formatVersion, fetchedAt, fetches, items[] }
 *   rayenz-itemdb-blacklist            — { formatVersion, byList: { [listId]: itemIid[] } }
 *   rayenz-itemdb-refresh-meta         — { lastAnyRefreshAt, lastRefreshAt, rateLimitedUntil }
 *
 * WishlistItem (cached items[], pre-sorted cheapest-first):
 *   itemIid, name, priceNp, image, shopWizardUrl, description
 *
 * Refresh policy (CACHE_TTL_MS = 24h, MIN_REFRESH_GAP_MS = 2h):
 *   Per list — serve from cache when present (zero network).
 *   At most one network fetch per visit: uncached lists first, then TTL refresh.
 *   Skip network when rateLimitedUntil is active (429 backoff).
 *   On fetch failure, fall back to stale cache when available.
 *
 * Pick: first cached item not in session skip or persistent blacklist.
 *
 * Next item: session-only skip (re-pick until reload).
 * Blacklist: persistent via context menu; survives cache refresh.
 *
 * Legacy v1 caches (info + itemdata) are ignored — lists re-fetch one at a time.
 *
 * Debug: localStorage['dailies-itemdb-debug'] = '1' for verbose picker trace.
 */

import type { DailiesWishlist } from '@rayenz-hub/shared';
import { bridgeFetch, hasItemdbBridge } from '../lib/neopets-bridge';
import { toUriEncodedKebabCase } from './string-utils';

export const ITEMDB_DEBUG_KEY = 'dailies-itemdb-debug';
const CACHE_KEY_PREFIX = 'rayenz-itemdb-cache:';
export const REFRESH_META_KEY = 'rayenz-itemdb-refresh-meta';
export const BLACKLIST_KEY = 'rayenz-itemdb-blacklist';
const BLACKLIST_MIGRATED_KEY = 'rayenz-itemdb-blacklist-migrated';
const LOCAL_HIDDEN_KEY = 'rayenz-itemdb-local-hidden';
const BLACKLIST_FORMAT_VERSION = 1;
export const CACHE_FORMAT_VERSION = 2;
export const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
export const MIN_REFRESH_GAP_MS = 2 * 60 * 60 * 1000;
export const RATE_LIMIT_BACKOFF_MS = 30 * 60 * 1000;
const SEED_GOURMET_BLACKLIST = [34756, 8781, 16232, 32402];

const sessionSkipIds: Record<string, number[]> = {};

export type WishlistItem = {
  itemIid: number;
  name: string;
  priceNp: number | null;
  image: string | null;
  shopWizardUrl: string | null;
  description: string | null;
};

export type ListCache = {
  formatVersion: number;
  fetchedAt: number;
  fetches: string[];
  items: WishlistItem[];
  localSkipIds?: number[];
};

export type BlacklistDoc = {
  formatVersion: number;
  byList: Record<string, number[]>;
};

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
  const user = (list && list.user) || 'rayenz';
  const slug = list && list.slug;
  return CACHE_KEY_PREFIX + encodeURIComponent(user) + ':' + encodeURIComponent(slug || '');
}

export function loadListCache(list: DailiesWishlist | null | undefined): ListCache | null {
  const raw = storageGet(cacheListKey(list));
  if (!raw) {
    return null;
  }
  try {
    const cache = JSON.parse(raw) as ListCache;
    if (!cache || cache.formatVersion !== CACHE_FORMAT_VERSION || !Array.isArray(cache.items)) {
      return null;
    }
    return list ? migrateCacheLocalSkips(list, cache) : cache;
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
  localStorage.setItem(cacheListKey(list), JSON.stringify(payload));
}

function writeListCache(list: DailiesWishlist, cache: ListCache): void {
  persistListCache(list, cache);
}

function emptyBlacklistDoc(): BlacklistDoc {
  return { formatVersion: BLACKLIST_FORMAT_VERSION, byList: {} };
}

export function loadBlacklist(): BlacklistDoc {
  ensureBlacklistMigrated();
  const raw = storageGet(BLACKLIST_KEY);
  if (!raw) {
    return emptyBlacklistDoc();
  }
  try {
    const doc = JSON.parse(raw) as BlacklistDoc;
    if (!doc || doc.formatVersion !== BLACKLIST_FORMAT_VERSION || !doc.byList) {
      return emptyBlacklistDoc();
    }
    return doc;
  } catch {
    return emptyBlacklistDoc();
  }
}

function saveBlacklist(doc: BlacklistDoc): void {
  storageSet(BLACKLIST_KEY, JSON.stringify(doc));
}

function mergeBlacklistIds(doc: BlacklistDoc, listId: string, ids: number[]): void {
  if (!listId || !Array.isArray(ids) || !ids.length) {
    return;
  }
  const existing = doc.byList[listId] ? doc.byList[listId].slice() : [];
  for (const id of ids) {
    if (id != null && !existing.includes(id)) {
      existing.push(id);
    }
  }
  if (existing.length) {
    doc.byList[listId] = existing;
  }
}

function ensureBlacklistMigrated(): void {
  if (storageGet(BLACKLIST_MIGRATED_KEY)) {
    return;
  }
  const doc = loadBlacklistRaw() || emptyBlacklistDoc();
  const legacyRaw = storageGet(LOCAL_HIDDEN_KEY);
  if (legacyRaw) {
    try {
      const map = JSON.parse(legacyRaw) as Record<string, number[]>;
      if (map && typeof map === 'object') {
        for (const listId of Object.keys(map)) {
          mergeBlacklistIds(doc, listId, map[listId]);
        }
      }
    } catch {
      /* ignore */
    }
    try {
      localStorage.removeItem(LOCAL_HIDDEN_KEY);
    } catch {
      /* ignore */
    }
  }
  mergeBlacklistIds(doc, 'gourmet-food', SEED_GOURMET_BLACKLIST);
  saveBlacklist(doc);
  storageSet(BLACKLIST_MIGRATED_KEY, '1');
}

function loadBlacklistRaw(): BlacklistDoc | null {
  const raw = storageGet(BLACKLIST_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as BlacklistDoc;
  } catch {
    return null;
  }
}

function migrateCacheLocalSkips(list: DailiesWishlist, cache: ListCache): ListCache {
  if (!cache || !Array.isArray(cache.localSkipIds) || !cache.localSkipIds.length) {
    if (cache && cache.localSkipIds) {
      delete cache.localSkipIds;
    }
    return cache;
  }
  const doc = loadBlacklist();
  mergeBlacklistIds(doc, list.id, cache.localSkipIds);
  saveBlacklist(doc);
  delete cache.localSkipIds;
  writeListCache(list, cache);
  return cache;
}

export function getBlacklistIds(list: DailiesWishlist | null | undefined): number[] {
  if (!list || !list.id) {
    return [];
  }
  const doc = loadBlacklist();
  const ids = doc.byList[list.id];
  return Array.isArray(ids) ? ids.slice() : [];
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
  return getSessionSkipIds(list?.id).concat(getBlacklistIds(list));
}

export function addToBlacklist(list: DailiesWishlist, itemIid: number): ListTarget {
  if (!list || !list.id || itemIid == null) {
    return pickNextForList(list);
  }
  const doc = loadBlacklist();
  mergeBlacklistIds(doc, list.id, [itemIid]);
  saveBlacklist(doc);
  return pickNextForList(list);
}

export function removeFromBlacklist(list: DailiesWishlist, itemIid: number): ListTarget {
  if (!list || !list.id || itemIid == null) {
    return pickNextForList(list);
  }
  const doc = loadBlacklist();
  const ids = doc.byList[list.id];
  if (!Array.isArray(ids)) {
    return pickNextForList(list);
  }
  doc.byList[list.id] = ids.filter((id) => id !== itemIid);
  if (!doc.byList[list.id].length) {
    delete doc.byList[list.id];
  }
  saveBlacklist(doc);
  return pickNextForList(list);
}

export function getBlacklistedItemsForMenu(list: DailiesWishlist): { itemIid: number; name: string }[] {
  const ids = getBlacklistIds(list);
  const cache = loadListCache(list);
  const byId: Record<number, WishlistItem> = {};
  if (cache && Array.isArray(cache.items)) {
    for (const item of cache.items) {
      if (item && item.itemIid != null) {
        byId[item.itemIid] = item;
      }
    }
  }
  return ids.map((id) => {
    const item = byId[id];
    return {
      itemIid: id,
      name: item && item.name ? item.name : 'Item ' + id,
    };
  });
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

function isEligibleForCache(row: ItemdbListRow, item: ItemdbItemdata | undefined): boolean {
  if (isListItemHidden(row)) {
    return false;
  }
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
    blacklist: getBlacklistIds(list).length,
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
    blacklist?: number;
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
  const skipNote = meta.blacklist != null ? ' blacklist=' + meta.blacklist : '';
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
      skipNote +
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
