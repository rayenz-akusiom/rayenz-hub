import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadHubModule, resetHubModules } from '../helpers/hubHarness.js';

function enableApi() {
   localStorage.setItem('rayenz-hub-api-url', 'http://127.0.0.1:3000');
   localStorage.setItem('rayenz-hub-api-key', 'test-api-key-local');
}

beforeEach(() => {
   resetHubModules();
   loadHubModule(['shared/hub-api-client.js', 'shared/storage.js', 'apps/deck-review/profile-sync.js']);
});

afterEach(() => {
   vi.unstubAllGlobals();
   resetHubModules();
});

describe('HubApiClient persistence helpers', () => {
   it('pushProfile PUTs yaml body', async () => {
      enableApi();
      const fetchMock = vi.fn(async () => ({
         status: 200,
         ok: true,
         json: async () => ({ deckId: 'deck-1', yaml: 'protected_cards:\n  - Sol Ring\n' }),
      }));
      vi.stubGlobal('fetch', fetchMock);

      await HubApiClient.pushProfile('deck-1', {
         yaml: 'protected_cards:\n  - Sol Ring\n',
         protectedCards: ['Sol Ring'],
         blockedCards: [],
      });

      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, opts] = fetchMock.mock.calls[0];
      expect(url).toBe('http://127.0.0.1:3000/v1/profiles/deck-1');
      expect(opts.method).toBe('PUT');
      expect(JSON.parse(opts.body).yaml).toContain('Sol Ring');
   });

   it('pullReviewProgress maps API record to HubStorage shape', async () => {
      enableApi();
      vi.stubGlobal('fetch', vi.fn(async () => ({
         status: 200,
         ok: true,
         json: async () => ({
            fileId: 'MSH-2026',
            decisions: { s1: 'accept' },
            currentDeckId: 'deck-1',
            currentSuggestionIndex: { 'deck-1': 2 },
         }),
      })));

      const progress = await HubApiClient.pullReviewProgress('MSH-2026');
      expect(progress).toEqual({
         decisions: { s1: 'accept' },
         currentDeckId: 'deck-1',
         currentSuggestionIndex: { 'deck-1': 2 },
      });
   });

   it('pullSetPool returns null for incomplete pools', async () => {
      enableApi();
      vi.stubGlobal('fetch', vi.fn(async () => ({
         status: 200,
         ok: true,
         json: async () => ({ codesKey: 'MSH', complete: false, cards: [] }),
      })));
      expect(await HubApiClient.pullSetPool('MSH')).toBe(null);
   });
});

describe('HubStorage dual-mode sync', () => {
   it('saveReviewProgress pushes when API configured', async () => {
      enableApi();
      const fetchMock = vi.fn(async () => ({
         status: 200,
         ok: true,
         json: async () => ({}),
      }));
      vi.stubGlobal('fetch', fetchMock);

      HubStorage.saveReviewProgress('MSH-2026', {
         decisions: { s1: 'skip' },
         currentDeckId: 'd1',
         currentSuggestionIndex: {},
      });

      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
      const [url, opts] = fetchMock.mock.calls[0];
      expect(url).toContain('/v1/review-progress/MSH-2026');
      expect(opts.method).toBe('PUT');
      expect(JSON.parse(opts.body).decisions).toEqual({ s1: 'skip' });
      expect(HubStorage.loadReviewProgress('MSH-2026').decisions).toEqual({ s1: 'skip' });
   });

   it('hydrateReviewProgressFromApi writes local cache', async () => {
      enableApi();
      vi.stubGlobal('fetch', vi.fn(async () => ({
         status: 200,
         ok: true,
         json: async () => ({
            decisions: { s2: 'accept' },
            currentDeckId: 'deck-x',
            currentSuggestionIndex: { 'deck-x': 1 },
         }),
      })));

      const progress = await HubStorage.hydrateReviewProgressFromApi('MSH-2026');
      expect(progress.decisions).toEqual({ s2: 'accept' });
      expect(HubStorage.loadReviewProgress('MSH-2026').currentDeckId).toBe('deck-x');
   });

   it('saveSetPoolCache pushes complete scopes', async () => {
      enableApi();
      const fetchMock = vi.fn(async () => ({
         status: 200,
         ok: true,
         json: async () => ({}),
      }));
      vi.stubGlobal('fetch', fetchMock);

      const scope = {
         complete: true,
         codes: ['MSH'],
         codesKey: 'MSH',
         cards: [{ name: 'A' }],
      };
      expect(HubStorage.saveSetPoolCache('MSH', scope)).toBe(true);
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
      expect(fetchMock.mock.calls[0][0]).toContain('/v1/set-pools/MSH');
   });

   it('hydrateSetPoolFromApi falls back to local on 404', async () => {
      const local = { complete: true, codes: ['MSH'], codesKey: 'MSH', cards: [] };
      HubStorage.saveSetPoolCache('MSH', local);
      enableApi();
      vi.stubGlobal('fetch', vi.fn(async () => ({ status: 404, ok: false })));

      const scope = await HubStorage.hydrateSetPoolFromApi('MSH');
      expect(scope.codes).toEqual(['MSH']);
   });
});

describe('ProfileSync API write path', () => {
   it('canWriteProfiles is true when API configured on mobile UA', () => {
      enableApi();
      const original = navigator.userAgent;
      Object.defineProperty(navigator, 'userAgent', {
         configurable: true,
         get: () => 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
      });
      expect(ProfileSync.canWriteProfiles()).toBe(true);
      expect(ProfileSync.canWriteProfilesViaDirectory()).toBe(false);
      Object.defineProperty(navigator, 'userAgent', {
         configurable: true,
         get: () => original,
      });
   });

   it('appendToProfileList pulls, appends, and pushes via API', async () => {
      enableApi();
      const yaml = 'protected_cards:\n  - Sol Ring\nblocked_cards: []\n';
      const fetchMock = vi.fn(async (url, opts) => {
         if (!opts || opts.method === 'GET' || !opts.method) {
            return {
               status: 200,
               ok: true,
               json: async () => ({ yaml }),
            };
         }
         return {
            status: 200,
            ok: true,
            json: async () => ({ deckId: 'deck-1', yaml: opts.body }),
         };
      });
      vi.stubGlobal('fetch', fetchMock);

      const result = await ProfileSync.appendToProfileList('deck-1', 'blocked_cards', 'Mana Crypt');
      expect(result.changed).toBe(true);
      expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
      const putCall = fetchMock.mock.calls.find((c) => c[1] && c[1].method === 'PUT');
      expect(putCall).toBeTruthy();
      const body = JSON.parse(putCall[1].body);
      expect(body.yaml).toContain('Mana Crypt');
      expect(body.blockedCards).toContain('Mana Crypt');
   });

   it('isConnected resolves true when API enabled', async () => {
      enableApi();
      expect(await ProfileSync.isConnected()).toBe(true);
   });
});
