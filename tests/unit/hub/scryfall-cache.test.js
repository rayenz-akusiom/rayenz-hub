import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadHubModule, resetHubModules } from '../helpers/hubHarness.js';

let ScryfallCache;

beforeEach(() => {
   resetHubModules();
   ScryfallCache = loadHubModule('shared/scryfall-cache.js', 'ScryfallCache');
});

afterEach(() => {
   resetHubModules();
   vi.restoreAllMocks();
});

describe('ScryfallCache.fetchPrintings', () => {
   it('caches printings by card name (single network call per name)', async () => {
      const prints = [{ id: 'a', name: 'Sol Ring', set: 'cmm', collector_number: '1' }];
      global.fetch = vi.fn(async () => ({
         ok: true,
         json: () => Promise.resolve({ data: prints }),
      }));

      const first = await ScryfallCache.fetchPrintings('Sol Ring');
      const second = await ScryfallCache.fetchPrintings('Sol Ring');

      expect(first).toEqual(prints);
      expect(second).toBe(first);
      expect(global.fetch).toHaveBeenCalledTimes(1);
   });

   it('falls back to defaultScryfallId when search fails', async () => {
      const fallback = { id: 'sf-99', name: 'Obscure Card', set: 'xxx', collector_number: '1' };
      global.fetch = vi.fn(async (url) => {
         if (String(url).includes('/cards/search')) {
            return { ok: false, status: 404, json: () => Promise.resolve({}) };
         }
         if (String(url).includes('/cards/sf-99')) {
            return { ok: true, json: () => Promise.resolve(fallback) };
         }
         return { ok: false, json: () => Promise.resolve({}) };
      });

      const result = await ScryfallCache.fetchPrintings('Obscure Card', { defaultScryfallId: 'sf-99' });

      expect(result).toEqual([fallback]);
      expect(global.fetch).toHaveBeenCalledTimes(2);
   });

   it('throws when search fails and no defaultScryfallId is provided', async () => {
      global.fetch = vi.fn(async () => ({
         ok: false,
         status: 404,
         json: () => Promise.resolve({}),
      }));

      await expect(ScryfallCache.fetchPrintings('Missing Card'))
         .rejects.toThrow('Scryfall lookup failed for Missing Card');
   });
});

describe('ScryfallCache.printCache', () => {
   it('is the same object exposed on the module', () => {
      expect(ScryfallCache.printCache).toBeTruthy();
      expect(typeof ScryfallCache.printCache).toBe('object');
   });
});
