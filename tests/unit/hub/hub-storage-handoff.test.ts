import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearDataSetPoolCache, tryRestoreSetPool } from '../../../packages/web/src/deck-suggest/data.ts';
import {
  getDailiesSettingsApi,
  getHubStorage,
  HubStorage,
  navigateHub,
  setParentHash,
} from '../../../packages/web/src/lib/hub-storage.ts';
import { installHubGlobals, resetHubGlobalsInstalled } from '../../../packages/web/src/hub/install-hub-globals.ts';
import { resetHubModules } from '../helpers/hubHarness.ts';

function enableApi() {
  localStorage.setItem('rayenz-hub-api-url', 'http://127.0.0.1:3000');
  localStorage.setItem('rayenz-hub-api-key', 'test-api-key-local');
}

/** Fetch Response-like mock for HubApiClient (uses res.text(), not res.json()). */
function jsonResponse(body: unknown, init: { status?: number; ok?: boolean } = {}) {
  const status = init.status ?? 200;
  const ok = init.ok ?? (status >= 200 && status < 300);
  const text = body == null ? '' : typeof body === 'string' ? body : JSON.stringify(body);
  return { status, ok, text: async () => text };
}
beforeEach(() => {
  resetHubModules();
  resetHubGlobalsInstalled();
  installHubGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetHubModules();
  resetHubGlobalsInstalled();
});

describe('HubStorage API hydration', () => {
  it('hydrateReviewProgressFromApi uses remote payload when API enabled', async () => {
    enableApi();
    const remote = { decisions: { remote: true }, currentDeckId: 'd1', currentSuggestionIndex: { d1: 1 } };
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(remote)));
    const hydrated = await HubStorage.hydrateReviewProgressFromApi('MSH-2026');
    expect(hydrated.decisions).toEqual({ remote: true });
    expect(HubStorage.loadReviewProgress('MSH-2026').decisions).toEqual({ remote: true });
  });

  it('hydrateSetPoolFromApi stores complete remote pool', async () => {
    const remote = { complete: true, codes: ['MSH'], codesKey: 'MSH', cards: [{ name: 'Remote Card' }] };
    enableApi();
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(remote)));
    const hydrated = await HubStorage.hydrateSetPoolFromApi('MSH');
    expect(hydrated).toEqual(remote);
    expect(HubStorage.loadSetPoolCache('MSH')).toEqual(remote);
  });

  it('saveReviewProgress pushes to API when configured', async () => {
    enableApi();
    const fetchMock = vi.fn(async () => jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);
    HubStorage.saveReviewProgress('MSH-2026', { decisions: {}, currentDeckId: null, currentSuggestionIndex: {} });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][0]).toContain('/v1/review-progress/');
  });

  it('clearSetPoolCache no-ops on empty key', () => {
    HubStorage.clearSetPoolCache('');
    expect(HubStorage.loadSetPoolCache('')).toBe(null);
  });

  it('navigateHub prefixes hash when missing', () => {
    navigateHub('/deck-review');
    expect(window.location.hash).toBe('#/deck-review');
  });
});

describe('HubStorage review handoff', () => {
  it('roundtrips save and consume', () => {
    const payload = {
      data: { meta: { set_code: 'MSH', generated_at: '2026-06-30' }, decks: [] },
      source: 'deck-suggest',
      savedAt: '2026-06-30T12:00:00.000Z',
    };
    expect(HubStorage.saveReviewHandoff(payload)).toBe(true);
    const consumed = HubStorage.consumeReviewHandoff();
    expect(consumed).toEqual(payload);
  });

  it('returns null on second consume', () => {
    HubStorage.saveReviewHandoff({ data: { decks: [] }, source: 'deck-suggest' });
    HubStorage.consumeReviewHandoff();
    expect(HubStorage.consumeReviewHandoff()).toBe(null);
  });

  it('prefers in-memory handoff over sessionStorage', () => {
    const memoryPayload = {
      data: { meta: { set_code: 'MSH' }, decks: [{ deck_id: 'mem' }] },
      source: 'deck-suggest',
    };
    const sessionPayload = {
      data: { meta: { set_code: 'OLD' }, decks: [] },
      source: 'deck-suggest',
    };
    (window as Window & { __hubReviewHandoff?: unknown }).__hubReviewHandoff = memoryPayload;
    sessionStorage.setItem('rayenz-deck-suggest-review-handoff', JSON.stringify(sessionPayload));
    const consumed = HubStorage.consumeReviewHandoff();
    expect(consumed).toEqual(memoryPayload);
    expect((window as Window & { __hubReviewHandoff?: unknown }).__hubReviewHandoff).toBeUndefined();
    expect(sessionStorage.getItem('rayenz-deck-suggest-review-handoff')).toBe(null);
  });

  it('falls back to sessionStorage when memory handoff is absent', () => {
    const sessionPayload = {
      data: { meta: { set_code: 'MSH' }, decks: [] },
      source: 'deck-suggest',
    };
    sessionStorage.setItem('rayenz-deck-suggest-review-handoff', JSON.stringify(sessionPayload));
    expect(HubStorage.consumeReviewHandoff()).toEqual(sessionPayload);
  });

  it('returns null for malformed sessionStorage JSON', () => {
    sessionStorage.setItem('rayenz-deck-suggest-review-handoff', '{not json');
    expect(HubStorage.consumeReviewHandoff()).toBe(null);
  });

  it('consumeMemoryReviewHandoff clears in-memory payload', () => {
    const payload = { data: { decks: [] }, source: 'deck-suggest' };
    (window as Window & { __hubReviewHandoff?: unknown }).__hubReviewHandoff = payload;
    expect(HubStorage.consumeMemoryReviewHandoff()).toEqual(payload);
    expect(HubStorage.consumeMemoryReviewHandoff()).toBe(null);
  });
});

describe('HubStorage set pool cache', () => {
  it('saves and loads complete scopes only', () => {
    const scope = {
      complete: true,
      codes: ['MSH', 'MAR'],
      codesKey: 'MAR,MSH',
      cards: [{ name: 'Card A' }],
    };
    expect(HubStorage.saveSetPoolCache('MAR,MSH', scope)).toBe(true);
    expect(HubStorage.loadSetPoolCache('MAR,MSH')).toEqual(scope);
  });

  it('does not save incomplete scopes', () => {
    expect(HubStorage.saveSetPoolCache('MSH', { complete: false, cards: [] })).toBe(false);
    expect(HubStorage.loadSetPoolCache('MSH')).toBe(null);
  });

  it('clears cache by key', () => {
    const scope = { complete: true, codes: ['MSH'], codesKey: 'MSH', cards: [] };
    HubStorage.saveSetPoolCache('MSH', scope);
    HubStorage.clearSetPoolCache('MSH');
    expect(HubStorage.loadSetPoolCache('MSH')).toBe(null);
  });

  it('ignores empty codesKey and incomplete cached scopes', () => {
    expect(HubStorage.saveSetPoolCache('', { complete: true, cards: [] })).toBe(false);
    expect(HubStorage.loadSetPoolCache('')).toBe(null);
    localStorage.setItem('rayenz-deck-suggest-set-pool-BAD', JSON.stringify({ complete: false, cards: [] }));
    expect(HubStorage.loadSetPoolCache('BAD')).toBe(null);
    localStorage.setItem('rayenz-deck-suggest-set-pool-BROKEN', '{bad json');
    expect(HubStorage.loadSetPoolCache('BROKEN')).toBe(null);
  });
});

describe('DeckSuggest tryRestoreSetPool', () => {
  it('restores from localStorage when memory cache is empty', () => {
    const scope = {
      complete: true,
      codes: ['MSH'],
      codesKey: 'MSH',
      cards: [{ name: 'A' }],
    };
    HubStorage.saveSetPoolCache('MSH', scope);
    clearDataSetPoolCache();
    const restored = tryRestoreSetPool('MSH');
    expect(restored?.codes).toEqual(scope.codes);
    expect(restored?.cards).toEqual(scope.cards);
    expect(restored?.indexVersion).toBe(1);
    expect(restored?.cardsByName?.a).toHaveLength(1);
  });
});

describe('HubStorage route and meta helpers', () => {
  it('defaults and persists last route', () => {
    expect(HubStorage.getLastRoute()).toBe('#/dailies');
    HubStorage.setLastRoute('#/deck-review');
    expect(HubStorage.getLastRoute()).toBe('#/deck-review');
  });

  it('fileIdFromMeta builds stable ids', () => {
    expect(HubStorage.fileIdFromMeta(null)).toBe('unknown-undated');
    expect(HubStorage.fileIdFromMeta({ set_code: 'MSH', generated_at: '2026-06-30' })).toBe('MSH-2026-06-30');
  });

  it('normalizeSetCodesKey sorts and uppercases', () => {
    expect(HubStorage.normalizeSetCodesKey(['msh', ' mar ', ''])).toBe('MAR,MSH');
    expect(HubStorage.normalizeSetCodesKey(null)).toBe('');
  });
});

describe('HubStorage settings loaders', () => {
  it('returns defaults when keys missing', () => {
    expect(HubStorage.loadOrderReconcileSettings()).toMatchObject({ registrySource: 'folder' });
    expect(HubStorage.loadDeckSuggestSettings()).toMatchObject({ rulesDebug: false });
    expect(HubStorage.loadDeckBuilderSettings()).toMatchObject({ allyThreeColourNames: 'shards' });
    expect(HubStorage.loadDailiesSettings()).toMatchObject({ faerieQuest: 'illusen' });
    expect(HubStorage.loadDailiesSettings().wishlists).toHaveLength(4);
  });

  it('merges stored JSON and tolerates malformed data', () => {
    localStorage.setItem('rayenz-order-reconcile-settings', JSON.stringify({ folderUrl: 'https://x' }));
    expect(HubStorage.loadOrderReconcileSettings().folderUrl).toBe('https://x');
    localStorage.setItem('rayenz-order-reconcile-settings', '{bad');
    expect(HubStorage.loadOrderReconcileSettings().registrySource).toBe('folder');

    localStorage.setItem('rayenz-deck-suggest-settings', JSON.stringify({ setCodes: 'MSH' }));
    expect(HubStorage.loadDeckSuggestSettings().setCodes).toBe('MSH');
    localStorage.setItem('rayenz-deck-suggest-settings', 'not-json');
    expect(HubStorage.loadDeckSuggestSettings().folderUrl).toBe('');

    localStorage.setItem('rayenz-deck-builder-settings', JSON.stringify({ enemyThreeColourNames: 'custom' }));
    expect(HubStorage.loadDeckBuilderSettings().enemyThreeColourNames).toBe('custom');
    localStorage.setItem('rayenz-deck-builder-settings', '{');
    expect(HubStorage.loadDeckBuilderSettings().allyThreeColourNames).toBe('shards');

    localStorage.setItem(
      'rayenz-dailies-settings',
      JSON.stringify({ faerieQuest: 'jhudora', schools: { battledome: false }, wishlists: [{ id: 'custom' }] }),
    );
    const dailies = HubStorage.loadDailiesSettings();
    expect(dailies.faerieQuest).toBe('jhudora');
    expect((dailies.schools as Record<string, boolean>).battledome).toBe(false);
    expect((dailies.schools as Record<string, boolean>)['faerie-quests']).toBe(true);
    expect(dailies.wishlists).toEqual([{ id: 'custom' }]);
    localStorage.setItem('rayenz-dailies-settings', '[]');
    expect(HubStorage.loadDailiesSettings().faerieQuest).toBe('illusen');
  });

  it('loadOrderReconcileProgress defaults and parses session data', () => {
    expect(HubStorage.loadOrderReconcileProgress()).toMatchObject({ phase: 'input' });
    HubStorage.saveOrderReconcileProgress('sess-1', { phase: 'assign', decisions: { a: 1 } });
    expect(HubStorage.loadOrderReconcileProgress('sess-1').phase).toBe('assign');
    localStorage.setItem('rayenz-order-reconcile-default', '{broken');
    expect(HubStorage.loadOrderReconcileProgress()).toMatchObject({ phase: 'input' });
  });

  it('loadReviewProgress returns empty object for missing or bad JSON', () => {
    expect(HubStorage.loadReviewProgress('MSH-2026')).toEqual({
      decisions: {},
      currentDeckId: null,
      currentSuggestionIndex: {},
    });
    localStorage.setItem('rayenz-deck-review-MSH-2026', '{bad');
    expect(HubStorage.loadReviewProgress('MSH-2026').decisions).toEqual({});
  });
});

describe('HubStorage dual-mode settings push', () => {
  it('saveOrderReconcileSettings pushes when API configured', async () => {
    enableApi();
    const fetchMock = vi.fn(async () => jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);
    HubStorage.saveOrderReconcileSettings({ folderUrl: 'https://archidekt.com' });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][0]).toContain('/v1/settings/order-reconcile');
  });

  it('saveDeckSuggestSettings pushes when API configured', async () => {
    enableApi();
    const fetchMock = vi.fn(async () => jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);
    HubStorage.saveDeckSuggestSettings({ setCodes: 'MSH' });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][0]).toContain('/v1/settings/deck-suggest');
  });

  it('saveDeckBuilderSettings pushes when API configured', async () => {
    enableApi();
    const fetchMock = vi.fn(async () => jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);
    HubStorage.saveDeckBuilderSettings({ allyThreeColourNames: 'custom' });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][0]).toContain('/v1/settings/deck-builder');
  });

  it('saveDailiesSettings pushes when API configured', async () => {
    enableApi();
    const fetchMock = vi.fn(async () => jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);
    HubStorage.saveDailiesSettings({ faerieQuest: 'jhudora' });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][0]).toContain('/v1/settings/dailies');
  });
});

describe('HubStorage hydrateReviewProgressFromApi edge cases', () => {
  it('returns local when fileId empty or API disabled', async () => {
    HubStorage.saveReviewProgress('MSH-2026', {
      decisions: { s1: 'accept' },
      currentDeckId: null,
      currentSuggestionIndex: {},
    });
    await expect(HubStorage.hydrateReviewProgressFromApi('')).resolves.toEqual({
      decisions: {},
      currentDeckId: null,
      currentSuggestionIndex: {},
    });
    await expect(HubStorage.hydrateReviewProgressFromApi('MSH-2026')).resolves.toMatchObject({
      decisions: { s1: 'accept' },
    });
  });

  it('falls back to local when remote null or fetch fails', async () => {
    HubStorage.saveReviewProgress('MSH-2026', { decisions: { local: true }, currentDeckId: null, currentSuggestionIndex: {} });
    enableApi();
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse('', { status: 404, ok: false })));
    await expect(HubStorage.hydrateReviewProgressFromApi('MSH-2026')).resolves.toMatchObject({ decisions: { local: true } });

    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse('err', { status: 500, ok: false })));
    await expect(HubStorage.hydrateReviewProgressFromApi('MSH-2026')).resolves.toMatchObject({ decisions: { local: true } });
  });
});

describe('HubStorage hydrateSetPoolFromApi edge cases', () => {
  it('returns local cache when API disabled or remote incomplete', async () => {
    const scope = { complete: true, codes: ['MSH'], codesKey: 'MSH', cards: [{ name: 'A' }] };
    HubStorage.saveSetPoolCache('MSH', scope);
    await expect(HubStorage.hydrateSetPoolFromApi('MSH')).resolves.toEqual(scope);

    enableApi();
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ complete: false, cards: [] })));
    await expect(HubStorage.hydrateSetPoolFromApi('MSH')).resolves.toEqual(scope);
  });
});

describe('HubStorage host helpers', () => {
  it('getHubStorage prefers window global', () => {
    const stub = { getLastRoute: () => '#/stub' };
    (window as Window & { HubStorage?: typeof stub }).HubStorage = stub as never;
    expect(getHubStorage().getLastRoute()).toBe('#/stub');
    delete (window as Window & { HubStorage?: unknown }).HubStorage;
    expect(getHubStorage().getLastRoute()).toBe('#/dailies');
  });

  it('getDailiesSettingsApi returns window DailiesSettings or null', () => {
    const api = { getMainPet: () => 'Fluffy', getMainPetSlug: () => '', getWishlists: () => [], saveMainPet: () => {} };
    (window as Window & { DailiesSettings?: typeof api }).DailiesSettings = api;
    expect(getDailiesSettingsApi()).toBe(api);
    delete (window as Window & { DailiesSettings?: unknown }).DailiesSettings;
    expect(getDailiesSettingsApi()).toBe(null);
  });

  it('navigateHub uses HubRouter when present else location.hash', () => {
    const navigate = vi.fn();
    (window as Window & { HubRouter?: { navigate: (h: string) => void } }).HubRouter = { navigate };
    navigateHub('#/deck-review');
    expect(navigate).toHaveBeenCalledWith('#/deck-review');
    delete (window as Window & { HubRouter?: unknown }).HubRouter;
    navigateHub('#/dailies');
    expect(window.location.hash).toBe('#/dailies');
  });

  it('setParentHash delegates to navigateHub', () => {
    const navigate = vi.fn();
    (window as Window & { HubRouter?: { navigate: (h: string) => void } }).HubRouter = { navigate };
    setParentHash('#/order-reconcile');
    expect(navigate).toHaveBeenCalledWith('#/order-reconcile');
  });
});