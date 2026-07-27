import { describe, expect, it, beforeEach, vi } from 'vitest';
import { installDailiesGlobals } from './installDailiesGlobals.ts';

const NOW = 1_700_000_000_000;

function makeList(id, slug) {
   return { id, label: id, slug, user: 'rayenz' };
}

function seedCache(list, info, itemdata, fetchedAt) {
   window.DailiesItemdb.saveListCache(list, { info, itemdata, fetches: ['list-info', 'itemdata'] }, fetchedAt);
}

function normalizeItems(info, itemdata) {
   return window.DailiesItemdb.normalizeWishlistFromApi({ info, itemdata, fetches: [] }).items;
}

function pickFromRaw(info, itemdata, options) {
   const items = normalizeItems(info, itemdata);
   return window.DailiesItemdb.pickFirstWishlistItem(items, options);
}

describe('dailies itemdb picker', () => {
   beforeEach(async () => {
      installDailiesGlobals();
      localStorage.clear();
      window.DailiesItemdb.resetItemdbMemoryForTests();
      const { resetAcquisitionStoreForTests } = await import(
         '../../../packages/web/src/dailies/acquisition-store.ts'
      );
      await resetAcquisitionStoreForTests();
      delete window.__bridgeFetch;
   });

   it('picks cheapest non-hidden tradeable item by ItemDB price', () => {
      const info = [
         { item_iid: 1, order: 0, isHidden: false },
         { item_iid: 2, order: 1, isHidden: false },
         { item_iid: 3, order: 2, isHidden: false }
      ];
      const itemdata = [
         { internal_id: 1, name: 'Expensive Item', specialType: 'trading', isNC: false, price: { value: 50000 } },
         { internal_id: 2, name: 'Cheap Item', specialType: 'trading', isNC: false, price: { value: 1200 }, findAt: { shopWizard: 'https://example/ssw' } },
         { internal_id: 3, name: 'Mid Item', specialType: 'trading', isNC: false, price: { value: 8000 } }
      ];
      const picked = pickFromRaw(info, itemdata);
      expect(picked.name).toBe('Cheap Item');
      expect(picked.itemIid).toBe(2);
      expect(picked.itemdbId).toBeUndefined();
      expect(picked.shopWizardUrl).toBe('https://example/ssw');
   });

   it('itemdbUrlForWishlistItem uses kebab-case item name', () => {
      expect(window.DailiesItemdb.itemdbUrlForWishlistItem({
         name: 'Cheap Book'
      })).toBe('https://itemdb.com.br/item/cheap-book');
      expect(window.DailiesItemdb.itemdbUrlForWishlistItem({
         itemdbId: 9001,
         name: 'Cheap Book'
      })).toBe('https://itemdb.com.br/item/cheap-book');
   });

   it('normalize stores itemIid and omits itemdbId', () => {
      const info = [{ item_iid: 42, order: 0, isHidden: false }];
      const itemdata = [
         { internal_id: 99, item_id: 42, name: 'Cheap Item', specialType: 'trading', isNC: false, price: { value: 1200 } }
      ];
      const items = normalizeItems(info, itemdata);
      expect(items[0].itemIid).toBe(42);
      expect(items[0].itemdbId).toBeUndefined();
      expect(items[0].name).toBe('Cheap Item');
   });

   it('includes ItemDB-hidden items in catalog (acquisition is local)', () => {
      const info = [
         { item_iid: 1, order: 0, isHidden: true },
         { item_iid: 2, order: 1, isHidden: false }
      ];
      const itemdata = [
         { internal_id: 1, name: 'Hidden Cheap', specialType: 'trading', isNC: false, price: { value: 100 } },
         { internal_id: 2, name: 'Visible Mid', specialType: 'trading', isNC: false, price: { value: 500 } }
      ];
      const picked = pickFromRaw(info, itemdata);
      expect(picked.name).toBe('Hidden Cheap');
   });

   it('skips NC items even when cheapest', () => {
      const info = [
         { item_iid: 1, order: 0, isHidden: true },
         { item_iid: 5, order: 1, isHidden: false }
      ];
      const itemdata = [
         { internal_id: 1, name: 'Hidden Item', specialType: 'trading', isNC: true, price: { value: 100 } },
         { internal_id: 5, name: 'NC Item', specialType: 'trading', isNC: true, price: { value: 50 } }
      ];
      expect(pickFromRaw(info, itemdata)).toBeNull();
   });

   it('treats isHidden false and undefined as visible', () => {
      expect(window.DailiesItemdb.isListItemHidden({ isHidden: false })).toBe(false);
      expect(window.DailiesItemdb.isListItemHidden({})).toBe(false);
      expect(window.DailiesItemdb.isListItemHidden({ isHidden: true })).toBe(true);
      expect(window.DailiesItemdb.isListItemHidden({ isHidden: 1 })).toBe(true);
   });

   it('itemInfoNeedsItemsMerge is true when any row lacks isHidden', () => {
      expect(window.DailiesItemdb.itemInfoNeedsItemsMerge([
         { item_iid: 1, isHidden: false },
         { item_iid: 2 }
      ])).toBe(true);
      expect(window.DailiesItemdb.itemInfoNeedsItemsMerge([
         { item_iid: 1, isHidden: false },
         { item_iid: 2, isHidden: true }
      ])).toBe(false);
      expect(window.DailiesItemdb.itemInfoNeedsItemsMerge([])).toBe(false);
   });

   it('mergeListItemRows marks hidden when either source has isHidden true', () => {
      const itemInfo = [
         { item_iid: 1, order: 0 },
         { item_iid: 2, order: 1, isHidden: false }
      ];
      const items = [
         { item_iid: 1, order: 0, isHidden: true },
         { item_iid: 2, order: 1 }
      ];
      const merged = window.DailiesItemdb.mergeListItemRows(itemInfo, items);
      expect(merged[0].isHidden).toBe(true);
      expect(merged[1].isHidden).toBe(false);
   });

   it('normalize keeps ItemDB-hidden items in catalog', () => {
      const info = [
         { item_iid: 1, order: 0, isHidden: true },
         { item_iid: 2, order: 1, isHidden: false }
      ];
      const itemdata = [
         { internal_id: 1, name: 'Hidden Cheap', specialType: 'trading', isNC: false, price: { value: 100 } },
         { internal_id: 2, name: 'Visible Mid', specialType: 'trading', isNC: false, price: { value: 500 } }
      ];
      const items = normalizeItems(info, itemdata);
      expect(items).toHaveLength(2);
      expect(items[0].name).toBe('Hidden Cheap');
   });

   it('falls back to first eligible item when none have prices', () => {
      const info = [
         { item_iid: 2, order: 0, isHidden: false },
         { item_iid: 3, order: 1, isHidden: false }
      ];
      const itemdata = [
         { internal_id: 2, name: 'First Tradeable', specialType: 'trading', isNC: false },
         { internal_id: 3, name: 'Second Tradeable', specialType: 'trading', isNC: false }
      ];
      const picked = pickFromRaw(info, itemdata);
      expect(picked.name).toBe('First Tradeable');
   });

   it('sorts priced items before zero NP in normalized cache', () => {
      const info = [
         { item_iid: 1, order: 0, isHidden: false },
         { item_iid: 2, order: 1, isHidden: false }
      ];
      const itemdata = [
         { internal_id: 1, name: 'Zero NP Book', specialType: 'trading', isNC: false, price: { value: 0 } },
         { internal_id: 2, name: 'Priced Book', specialType: 'trading', isNC: false, price: { value: 500 } }
      ];
      const items = normalizeItems(info, itemdata);
      expect(items[0].name).toBe('Priced Book');
      expect(items[1].name).toBe('Zero NP Book');
      expect(pickFromRaw(info, itemdata).name).toBe('Priced Book');
   });

   it('picks zero NP only when no priced eligible items remain', () => {
      const info = [
         { item_iid: 1, order: 0, isHidden: false },
         { item_iid: 2, order: 1, isHidden: false }
      ];
      const itemdata = [
         { internal_id: 1, name: 'Zero NP Book', specialType: 'trading', isNC: false, price: { value: 0 } },
         { internal_id: 2, name: 'No Price Book', specialType: 'trading', isNC: false }
      ];
      const picked = pickFromRaw(info, itemdata);
      expect(picked.name).toBe('Zero NP Book');
   });

   it('pickFirstWishlistItem skips local skip ids', () => {
      const items = [
         { itemIid: 1, name: 'Cheap', priceNp: 100 },
         { itemIid: 2, name: 'Next', priceNp: 500 }
      ];
      const picked = window.DailiesItemdb.pickFirstWishlistItem(items, { skipItemIds: [1] });
      expect(picked.name).toBe('Next');
   });

   it('503 maps to unavailable not rate limit', () => {
      expect(window.DailiesItemdb.itemdbErrorMessage(503, 'list info')).toContain('temporarily unavailable');
      expect(window.DailiesItemdb.itemdbErrorMessage(503, 'list info')).not.toContain('rate limit');
   });

   it('429 mentions outage as well as rate limit', () => {
      expect(window.DailiesItemdb.itemdbErrorMessage(429, 'items')).toContain('rate limit');
      expect(window.DailiesItemdb.itemdbErrorMessage(429, 'items')).toContain('outage');
   });

   it('returns no-bridge when userscript bridge is unavailable', async () => {
      const lists = [{ id: 'test', label: 'Test', slug: 'test-list', user: 'rayenz' }];
      const results = await window.DailiesItemdb.loadListTargets(lists, {});
      expect(results).toHaveLength(1);
      expect(results[0].error).toBe('no-bridge');
      expect(results[0].item).toBeNull();
   });

   it('loads list data without items call when every row has isHidden defined', async () => {
      const itemInfo = [
         { item_iid: 2, order: 0, isHidden: false },
         { item_iid: 3, order: 1, isHidden: true }
      ];
      const itemdata = [{ internal_id: 2, name: 'Cheap Item', specialType: 'trading', isNC: false, price: { value: 100 } }];
      const calls = [];

      window.__bridgeFetch = async (url) => {
         calls.push(url);
         if (url.endsWith('/itemdata')) {
            return { ok: true, status: 200, json: async () => itemdata };
         }
         if (url.endsWith('/items')) {
            throw new Error('items endpoint should not be called');
         }
         return {
            ok: true,
            status: 200,
            json: async () => [{ name: 'Books', itemInfo: itemInfo }]
         };
      };

      const results = await window.DailiesItemdb.loadListTargets(
         [{ id: 'books', label: 'Books', slug: 'book-list', user: 'rayenz' }],
         {}
      );

      expect(calls.some((url) => url.endsWith('/rayenz/book-list') && !url.endsWith('/items') && !url.endsWith('/itemdata'))).toBe(true);
      expect(calls.some((url) => url.endsWith('/items'))).toBe(false);
      expect(calls.some((url) => url.endsWith('/itemdata'))).toBe(true);
      expect(results[0].item.name).toBe('Cheap Item');
      expect(results[0].error).toBeNull();

      delete window.__bridgeFetch;
   });

   it('merges items endpoint when itemInfo has partial isHidden flags', async () => {
      const itemInfo = [
         { item_iid: 1, order: 0, isHidden: false },
         { item_iid: 2, order: 1 }
      ];
      const items = [
         { item_iid: 1, order: 0, isHidden: false },
         { item_iid: 2, order: 1, isHidden: true }
      ];
      const itemdata = [
         { internal_id: 1, name: 'Neopolitan Magazine', specialType: 'trading', isNC: false, price: { value: 500 } },
         { internal_id: 2, name: 'Spot The Aisha', specialType: 'trading', isNC: false, price: { value: 100 } }
      ];
      const calls = [];

      window.__bridgeFetch = async (url) => {
         calls.push(url);
         if (url.endsWith('/itemdata')) {
            return { ok: true, status: 200, json: async () => itemdata };
         }
         if (url.endsWith('/items')) {
            return { ok: true, status: 200, json: async () => items };
         }
         return {
            ok: true,
            status: 200,
            json: async () => [{ name: 'Books', itemInfo: itemInfo }]
         };
      };

      const results = await window.DailiesItemdb.loadListTargets(
         [{ id: 'books', label: 'Books', slug: 'book-list', user: 'rayenz' }],
         {}
      );

      expect(calls.some((url) => url.endsWith('/items'))).toBe(true);
      // Spot is cheaper; isHidden no longer excludes it from the catalog
      expect(results[0].item.name).toBe('Spot The Aisha');
      expect(results[0].error).toBeNull();

      delete window.__bridgeFetch;
   });

   it('merges items endpoint when itemInfo lacks isHidden flags entirely', async () => {
      const itemInfo = [{ item_iid: 1, order: 0 }];
      const items = [{ item_iid: 1, order: 0, isHidden: true }];
      const itemdata = [
         { internal_id: 1, name: 'Hidden Cheap', specialType: 'trading', isNC: false, price: { value: 100 } },
         { internal_id: 2, name: 'Visible Item', specialType: 'trading', isNC: false, price: { value: 500 } }
      ];
      const calls = [];

      window.__bridgeFetch = async (url) => {
         calls.push(url);
         if (url.endsWith('/itemdata')) {
            return { ok: true, status: 200, json: async () => itemdata };
         }
         if (url.endsWith('/items')) {
            return { ok: true, status: 200, json: async () => items };
         }
         return {
            ok: true,
            status: 200,
            json: async () => [{ name: 'Stamps', itemInfo: itemInfo }]
         };
      };

      const results = await window.DailiesItemdb.loadListTargets(
         [{ id: 'stamps', label: 'Stamps', slug: 'stamp-list', user: 'rayenz' }],
         {}
      );

      expect(calls.some((url) => url.endsWith('/items'))).toBe(true);
      expect(results[0].item.name).toBe('Hidden Cheap');
      expect(results[0].error).toBeNull();

      delete window.__bridgeFetch;
   });

   it('falls back to items endpoint when list info has no itemInfo', async () => {
      const items = [{ item_iid: 3, order: 0, isHidden: false }];
      const itemdata = [{ internal_id: 3, name: 'Fallback Item', specialType: 'trading', isNC: false, price: { value: 200 } }];

      window.__bridgeFetch = async (url) => {
         if (url.endsWith('/itemdata')) {
            return { ok: true, status: 200, json: async () => itemdata };
         }
         if (url.endsWith('/items')) {
            return { ok: true, status: 200, json: async () => items };
         }
         return { ok: true, status: 200, json: async () => [{ name: 'No itemInfo list' }] };
      };

      const results = await window.DailiesItemdb.loadListTargets(
         [{ id: 'books', label: 'Books', slug: 'book-list', user: 'rayenz' }],
         {}
      );

      expect(results[0].item.name).toBe('Fallback Item');
      delete window.__bridgeFetch;
   });

   it('surfaces session expired on 401', async () => {
      window.__bridgeFetch = async () => ({
         ok: false,
         status: 401,
         json: async () => ({ error: 'Unauthorized' })
      });

      const results = await window.DailiesItemdb.loadListTargets(
         [{ id: 'books', label: 'Books', slug: 'book-list', user: 'rayenz' }],
         {}
      );

      expect(results[0].error).toContain('session expired');
      delete window.__bridgeFetch;
   });
});

describe('dailies itemdb cache and skip', () => {
   beforeEach(async () => {
      installDailiesGlobals();
      localStorage.clear();
      window.DailiesItemdb.resetItemdbMemoryForTests();
      const { resetAcquisitionStoreForTests } = await import(
         '../../../packages/web/src/dailies/acquisition-store.ts'
      );
      await resetAcquisitionStoreForTests();
      delete window.__bridgeFetch;
   });

   it('cache read/write round-trips v2 normalized items', () => {
      const list = makeList('books', 'book-list');
      const payload = {
         info: [{ item_iid: 1, order: 0, isHidden: false }],
         itemdata: [{
            internal_id: 1,
            name: 'Cached Item',
            specialType: 'trading',
            isNC: false,
            price: { value: 100 },
            description: 'A book'
         }],
         fetches: ['list-info', 'itemdata']
      };
      window.DailiesItemdb.saveListCache(list, payload, NOW);
      const loaded = window.DailiesItemdb.loadListCache(list);
      expect(loaded.fetchedAt).toBe(NOW);
      expect(loaded.formatVersion).toBe(window.DailiesItemdb.CACHE_FORMAT_VERSION);
      expect(loaded.localSkipIds).toBeUndefined();
      expect(loaded.items).toEqual([{
         itemIid: 1,
         name: 'Cached Item',
         priceNp: 100,
         image: null,
         shopWizardUrl: null,
         description: 'A book'
      }]);
      expect(loaded.info).toBeUndefined();
      expect(loaded.itemdata).toBeUndefined();
   });

   it('clears legacy blacklist keys on hydrate', async () => {
      localStorage.setItem('rayenz-itemdb-blacklist', '{"formatVersion":1,"byList":{}}');
      localStorage.setItem('rayenz-itemdb-blacklist-migrated', '1');
      localStorage.setItem('rayenz-itemdb-local-hidden', '{}');
      await window.DailiesItemdb.hydrateListState([]);
      expect(localStorage.getItem('rayenz-itemdb-blacklist')).toBeNull();
      expect(localStorage.getItem('rayenz-itemdb-blacklist-migrated')).toBeNull();
      expect(localStorage.getItem('rayenz-itemdb-local-hidden')).toBeNull();
   });

   it('strips localSkipIds from legacy cache payloads', () => {
      const list = makeList('books', 'book-list');
      localStorage.setItem(
         window.DailiesItemdb.cacheListKey(list),
         JSON.stringify({
            formatVersion: 2,
            fetchedAt: NOW,
            fetches: ['list-info'],
            items: [{ itemIid: 1, name: 'Item', priceNp: 100, image: null, shopWizardUrl: null, description: null }],
            localSkipIds: [5, 6]
         })
      );

      const loaded = window.DailiesItemdb.loadListCache(list);
      expect(loaded.localSkipIds).toBeUndefined();
      expect(loaded.items[0].name).toBe('Item');
   });

   it('rejects legacy v1 cache format', () => {
      const list = makeList('books', 'book-list');
      localStorage.setItem(
         window.DailiesItemdb.cacheListKey(list),
         JSON.stringify({
            fetchedAt: NOW,
            info: [{ item_iid: 1, isHidden: false }],
            itemdata: [{ internal_id: 1, name: 'Old Item', specialType: 'trading', isNC: false, price: { value: 100 } }],
            fetches: ['list-info', 'itemdata']
         })
      );
      expect(window.DailiesItemdb.loadListCache(list)).toBeNull();
   });

   it('saves catalog with descriptions to memory/IDB', () => {
      const list = makeList('books', 'big-list');
      const payload = {
         info: [{ item_iid: 1, order: 0, isHidden: false }],
         itemdata: [{
            internal_id: 1,
            name: 'Big Item',
            specialType: 'trading',
            isNC: false,
            price: { value: 100 },
            description: 'Very long description'
         }],
         fetches: ['list-info', 'itemdata']
      };

      const saved = window.DailiesItemdb.saveListCache(list, payload, NOW);

      expect(saved).toBe(true);
      const loaded = window.DailiesItemdb.loadListCache(list);
      expect(loaded.items[0].description).toBe('Very long description');
      expect(loaded.items[0].name).toBe('Big Item');
   });

   it('only fetches uncached list when others are cached', async () => {
      const listA = makeList('books', 'book-a');
      const listB = makeList('stamps', 'stamp-a');
      const info = [{ item_iid: 1, order: 0, isHidden: false }];
      const itemdata = [{ internal_id: 1, name: 'Cached Item', specialType: 'trading', isNC: false, price: { value: 100 } }];
      seedCache(listA, info, itemdata, NOW);
      const calls = [];

      window.__bridgeFetch = async (url) => {
         calls.push(url);
         if (url.endsWith('/itemdata')) {
            return { ok: true, status: 200, json: async () => [{ internal_id: 2, name: 'New Item', specialType: 'trading', isNC: false, price: { value: 200 } }] };
         }
         return {
            ok: true,
            status: 200,
            json: async () => [{ name: 'List', itemInfo: [{ item_iid: 2, order: 0, isHidden: false }] }]
         };
      };

      const results = await window.DailiesItemdb.loadListTargets([listA, listB], {}, { now: NOW });

      const listInfoCalls = calls.filter((url) => url.includes('/lists/rayenz/') && !url.endsWith('/items') && !url.endsWith('/itemdata'));
      expect(listInfoCalls).toHaveLength(1);
      expect(listInfoCalls[0]).toContain('stamp-a');
      expect(results[0].item.name).toBe('Cached Item');
      expect(results[0].fromCache).toBe(true);
      expect(results[1].refreshed).toBe(true);
      delete window.__bridgeFetch;
   });

   it('fetches at most one uncached list per visit', async () => {
      const lists = [makeList('books', 'book-a'), makeList('stamps', 'stamp-a')];
      const calls = [];

      window.__bridgeFetch = async (url) => {
         calls.push(url);
         if (url.endsWith('/itemdata')) {
            return { ok: true, status: 200, json: async () => [{ internal_id: 1, name: 'Item', specialType: 'trading', isNC: false, price: { value: 100 } }] };
         }
         return {
            ok: true,
            status: 200,
            json: async () => [{ name: 'List', itemInfo: [{ item_iid: 1, order: 0, isHidden: false }] }]
         };
      };

      const results = await window.DailiesItemdb.loadListTargets(lists, {}, { now: NOW });

      const listInfoCalls = calls.filter((url) => url.includes('/lists/rayenz/') && !url.endsWith('/items') && !url.endsWith('/itemdata'));
      expect(listInfoCalls).toHaveLength(1);
      expect(results[0].refreshed).toBe(true);
      expect(results[1].error).toBe('waiting-for-cache');
      delete window.__bridgeFetch;
   });

   it('429 sets rateLimitedUntil and skips further fetches', async () => {
      const lists = [makeList('books', 'book-a'), makeList('stamps', 'stamp-a')];

      window.__bridgeFetch = async () => ({
         ok: false,
         status: 429,
         json: async () => ({ error: 'Too Many Requests' })
      });

      const results = await window.DailiesItemdb.loadListTargets(lists, {}, { now: NOW });

      const meta = window.DailiesItemdb.loadRefreshMeta();
      expect(meta.rateLimitedUntil).toBe(NOW + window.DailiesItemdb.RATE_LIMIT_BACKOFF_MS);
      expect(results[0].error).toContain('rate limit');
      expect(results[1].error).toBe('waiting-for-cache');
      delete window.__bridgeFetch;
   });

   it('uncached list wins fetch slot over due TTL refresh', async () => {
      const listA = makeList('books', 'book-a');
      const listB = makeList('stamps', 'stamp-a');
      const info = [{ item_iid: 1, order: 0, isHidden: false }];
      const itemdata = [{ internal_id: 1, name: 'Stale Item', specialType: 'trading', isNC: false, price: { value: 100 } }];
      const ttl = window.DailiesItemdb.CACHE_TTL_MS;
      const gap = window.DailiesItemdb.MIN_REFRESH_GAP_MS;

      seedCache(listA, info, itemdata, NOW - ttl - 1000);
      window.DailiesItemdb.saveRefreshMeta({
         lastAnyRefreshAt: NOW - gap - 1000,
         lastRefreshAt: { 'books': NOW - ttl - 1000 },
         rateLimitedUntil: 0
      });

      const calls = [];
      window.__bridgeFetch = async (url) => {
         calls.push(url);
         if (url.endsWith('/itemdata')) {
            return { ok: true, status: 200, json: async () => [{ internal_id: 2, name: 'Fresh Item', specialType: 'trading', isNC: false, price: { value: 50 } }] };
         }
         return {
            ok: true,
            status: 200,
            json: async () => [{ name: 'List', itemInfo: [{ item_iid: 2, order: 0, isHidden: false }] }]
         };
      };

      const results = await window.DailiesItemdb.loadListTargets([listA, listB], {}, { now: NOW });

      expect(calls.some((url) => url.includes('stamp-a'))).toBe(true);
      expect(calls.some((url) => url.includes('book-a'))).toBe(false);
      expect(results[0].fromCache).toBe(true);
      expect(results[1].refreshed).toBe(true);
      delete window.__bridgeFetch;
   });

   it('all cached and rate limited serves cache without network', async () => {
      const listA = makeList('books', 'book-a');
      const listB = makeList('stamps', 'stamp-a');
      const info = [{ item_iid: 1, order: 0, isHidden: false }];
      const itemdata = [{ internal_id: 1, name: 'Item', specialType: 'trading', isNC: false, price: { value: 100 } }];

      seedCache(listA, info, itemdata, NOW - 1000);
      seedCache(listB, info, itemdata, NOW - 1000);
      window.DailiesItemdb.saveRefreshMeta({
         lastAnyRefreshAt: 0,
         lastRefreshAt: {},
         rateLimitedUntil: NOW + window.DailiesItemdb.RATE_LIMIT_BACKOFF_MS
      });

      const calls = [];
      window.__bridgeFetch = async (url) => {
         calls.push(url);
         return { ok: true, status: 200, json: async () => [] };
      };

      const results = await window.DailiesItemdb.loadListTargets([listA, listB], {}, { now: NOW });

      expect(calls).toHaveLength(0);
      expect(results[0].fromCache).toBe(true);
      expect(results[1].fromCache).toBe(true);
      delete window.__bridgeFetch;
   });

   it('warm path refreshes at most one due list', async () => {
      const listA = makeList('books', 'book-a');
      const listB = makeList('stamps', 'stamp-a');
      const info = [{ item_iid: 1, order: 0, isHidden: false }];
      const itemdata = [{ internal_id: 1, name: 'Item', specialType: 'trading', isNC: false, price: { value: 100 } }];
      const ttl = window.DailiesItemdb.CACHE_TTL_MS;
      const gap = window.DailiesItemdb.MIN_REFRESH_GAP_MS;

      seedCache(listA, info, itemdata, NOW - ttl - 1000);
      seedCache(listB, info, itemdata, NOW - 1000);
      window.DailiesItemdb.saveRefreshMeta({
         lastAnyRefreshAt: NOW - gap - 1000,
         lastRefreshAt: { 'books': NOW - ttl - 1000, 'stamps': NOW - 1000 }
      });

      const calls = [];
      window.__bridgeFetch = async (url) => {
         calls.push(url);
         if (url.endsWith('/itemdata')) {
            return { ok: true, status: 200, json: async () => itemdata };
         }
         return {
            ok: true,
            status: 200,
            json: async () => [{ name: 'List', itemInfo: info }]
         };
      };

      const results = await window.DailiesItemdb.loadListTargets([listA, listB], {}, { now: NOW });

      expect(calls.some((url) => url.includes('book-a'))).toBe(true);
      expect(calls.some((url) => url.includes('stamp-a'))).toBe(false);
      expect(results[0].refreshed).toBe(true);
      expect(results[1].fromCache).toBe(true);
      delete window.__bridgeFetch;
   });

   it('2h gate blocks refresh when lastAnyRefreshAt is too recent', async () => {
      const list = makeList('books', 'book-a');
      const info = [{ item_iid: 1, order: 0, isHidden: false }];
      const itemdata = [{ internal_id: 1, name: 'Item', specialType: 'trading', isNC: false, price: { value: 100 } }];
      const ttl = window.DailiesItemdb.CACHE_TTL_MS;

      seedCache(list, info, itemdata, NOW - ttl - 1000);
      window.DailiesItemdb.saveRefreshMeta({
         lastAnyRefreshAt: NOW - 1000,
         lastRefreshAt: { 'books': NOW - ttl - 1000 }
      });

      const calls = [];
      window.__bridgeFetch = async (url) => {
         calls.push(url);
         return { ok: true, status: 200, json: async () => [] };
      };

      const results = await window.DailiesItemdb.loadListTargets([list], {}, { now: NOW });

      expect(calls).toHaveLength(0);
      expect(results[0].fromCache).toBe(true);
      expect(results[0].refreshed).toBe(false);
      delete window.__bridgeFetch;
   });

   it('skipCurrentItem session-skips and re-picks', () => {
      const list = makeList('books', 'book-a');
      const info = [
         { item_iid: 1, order: 0, isHidden: false },
         { item_iid: 2, order: 1, isHidden: false }
      ];
      const itemdata = [
         { internal_id: 1, name: 'Cheap', specialType: 'trading', isNC: false, price: { value: 100 } },
         { internal_id: 2, name: 'Next', specialType: 'trading', isNC: false, price: { value: 500 } }
      ];
      seedCache(list, info, itemdata, NOW);

      const target = window.DailiesItemdb.skipCurrentItem(list, 1);

      expect(target.item.name).toBe('Next');
      expect(target.fromCache).toBe(true);
   });

   it('markItemAcquired removes item from picks across cache refresh', async () => {
      const list = makeList('books', 'book-a');
      const info = [
         { item_iid: 1, order: 0, isHidden: false },
         { item_iid: 2, order: 1, isHidden: false }
      ];
      const itemdata = [
         { internal_id: 1, name: 'Cheap', specialType: 'trading', isNC: false, price: { value: 100 } },
         { internal_id: 2, name: 'Next', specialType: 'trading', isNC: false, price: { value: 500 } }
      ];
      seedCache(list, info, itemdata, NOW);

      const target = await window.DailiesItemdb.markItemAcquired(list, 1, 'manual');
      expect(target.item.name).toBe('Next');

      window.DailiesItemdb.saveListCache(list, { info, itemdata, fetches: ['list-info', 'itemdata'] }, NOW + 1000);
      const afterRefresh = window.DailiesItemdb.pickNextForList(list);
      expect(afterRefresh.item.name).toBe('Next');
   });

   it('session skip clears on clearSessionSkips', () => {
      const list = makeList('books', 'book-a');
      const info = [
         { item_iid: 1, order: 0, isHidden: false },
         { item_iid: 2, order: 1, isHidden: false }
      ];
      const itemdata = [
         { internal_id: 1, name: 'Cheap', specialType: 'trading', isNC: false, price: { value: 100 } },
         { internal_id: 2, name: 'Next', specialType: 'trading', isNC: false, price: { value: 500 } }
      ];
      seedCache(list, info, itemdata, NOW);

      window.DailiesItemdb.skipCurrentItem(list, 1);
      window.DailiesItemdb.clearSessionSkips();
      const target = window.DailiesItemdb.pickNextForList(list);
      expect(target.item.name).toBe('Cheap');
   });

   it('scheduler picks oldest due cache first', () => {
      const listA = makeList('books', 'book-a');
      const listB = makeList('stamps', 'stamp-a');
      const ttl = window.DailiesItemdb.CACHE_TTL_MS;
      const gap = window.DailiesItemdb.MIN_REFRESH_GAP_MS;
      const caches = {
         'books': { fetchedAt: NOW - ttl - 5000 },
         'stamps': { fetchedAt: NOW - ttl - 10000 }
      };
      const meta = { lastAnyRefreshAt: NOW - gap - 1000, lastRefreshAt: {} };
      const picked = window.DailiesItemdb.pickListToRefresh([listA, listB], caches, meta, NOW);
      expect(picked.id).toBe('stamps');
   });

   it('warm refresh failure serves cached pick', async () => {
      const list = makeList('books', 'book-a');
      const info = [{ item_iid: 1, order: 0, isHidden: false }];
      const itemdata = [{ internal_id: 1, name: 'Cached Book', specialType: 'trading', isNC: false, price: { value: 100 } }];
      const ttl = window.DailiesItemdb.CACHE_TTL_MS;
      const gap = window.DailiesItemdb.MIN_REFRESH_GAP_MS;

      seedCache(list, info, itemdata, NOW - ttl - 1000);
      window.DailiesItemdb.saveRefreshMeta({
         lastAnyRefreshAt: NOW - gap - 1000,
         lastRefreshAt: { 'books': NOW - ttl - 1000 }
      });

      window.__bridgeFetch = async () => {
         throw new Error('ItemDB temporarily unavailable — try again later');
      };

      const results = await window.DailiesItemdb.loadListTargets([list], {}, { now: NOW });

      expect(results[0].item.name).toBe('Cached Book');
      expect(results[0].fromCache).toBe(true);
      expect(results[0].error).toBeNull();
      delete window.__bridgeFetch;
   });
});
