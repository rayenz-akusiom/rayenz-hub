import { describe, expect, it, vi } from 'vitest';
import { clearDataSetPoolCache, tryRestoreSetPool } from '../../../packages/web/src/deck-suggest/data.ts';
import {
  getDailiesSettingsApi,
  getHubStorage,
  HubStorage,
  navigateHub,
  setParentHash,
} from '../../../packages/web/src/lib/hub-storage.ts';
import { getHubApiConfig } from '../../../packages/web/src/api/hub-api-client.ts';
import {
  enableHubApi,
  installHubApiGlobalsLifecycle,
  jsonResponse,
} from '../helpers/hubHarness.ts';

installHubApiGlobalsLifecycle();

describe('HubStorage API hydration', () => {
  it('hydrateReviewProgressFromApi uses remote payload when API enabled', async () => {
    enableHubApi();
    const remote = { decisions: { remote: true }, currentDeckId: 'd1', currentSuggestionIndex: { d1: 1 } };
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(remote)));
    const hydrated = await HubStorage.hydrateReviewProgressFromApi('MSH-2026');
    expect(hydrated.decisions).toEqual({ remote: true });
    expect(HubStorage.loadReviewProgress('MSH-2026').decisions).toEqual({ remote: true });
  });

  it('hydrateSetPoolFromApi stores complete remote pool', async () => {
    const remote = {
      complete: true,
      codes: ['MSH'],
      codesKey: 'MSH',
      cards: [{ name: 'Remote Card' }],
      formatVersion: 3,
    };
    enableHubApi();
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(remote)));
    const hydrated = await HubStorage.hydrateSetPoolFromApi('MSH');
    expect(hydrated).toEqual(remote);
    expect(HubStorage.loadSetPoolCache('MSH')).toEqual(remote);
  });

  it('saveReviewProgress pushes to API when configured', async () => {
    enableHubApi();
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

describe('HubStorage set pool cache', () => {
  it('saves and loads complete scopes only', () => {
    const scope = {
      complete: true,
      codes: ['MSH', 'MAR'],
      codesKey: 'MAR,MSH',
      cards: [{ name: 'Card A' }],
    };
    expect(HubStorage.saveSetPoolCache('MAR,MSH', scope)).toBe(true);
    expect(HubStorage.loadSetPoolCache('MAR,MSH')).toEqual({ ...scope, formatVersion: 3 });
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

  it('ignores empty codesKey', () => {
    expect(HubStorage.saveSetPoolCache('', { complete: true, cards: [] })).toBe(false);
    expect(HubStorage.loadSetPoolCache('')).toBe(null);
  });
});

describe('DeckSuggest tryRestoreSetPool', () => {
  it('restores from HubStorage memory when data module cache is empty', () => {
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
    expect(HubStorage.loadDailiesSettings().trackingLists).toEqual({});
  });

  it('MTG settings use in-memory store; dailies still use localStorage', () => {
    HubStorage.saveOrderReconcileSettings({ folderUrl: 'https://x' });
    expect(HubStorage.loadOrderReconcileSettings().folderUrl).toBe('https://x');
    expect(localStorage.getItem('rayenz-order-reconcile-settings')).toBe(null);

    HubStorage.saveDeckSuggestSettings({ setCodes: 'MSH' });
    expect(HubStorage.loadDeckSuggestSettings().setCodes).toBe('MSH');
    expect(localStorage.getItem('rayenz-deck-suggest-settings')).toBe(null);

    HubStorage.saveDeckBuilderSettings({ enemyThreeColourNames: 'custom' });
    expect(HubStorage.loadDeckBuilderSettings().enemyThreeColourNames).toBe('custom');
    expect(localStorage.getItem('rayenz-deck-builder-settings')).toBe(null);

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
    localStorage.setItem(
      'rayenz-dailies-settings',
      JSON.stringify({ trackingLists: 'nope', schools: null, wishlists: 'legacy' }),
    );
    const fallback = HubStorage.loadDailiesSettings();
    expect(fallback.trackingLists).toEqual({});
    expect(fallback.wishlists).toBeUndefined();
    localStorage.setItem('rayenz-dailies-settings', '{not-json');
    expect(HubStorage.loadDailiesSettings()).toMatchObject({ faerieQuest: 'illusen', trackingLists: {} });
  });

  it('loadOrderReconcileProgress defaults and parses session data from memory', () => {
    expect(HubStorage.loadOrderReconcileProgress()).toMatchObject({ phase: 'input' });
    HubStorage.saveOrderReconcileProgress('sess-1', { phase: 'assign', decisions: { a: 1 } });
    expect(HubStorage.loadOrderReconcileProgress('sess-1').phase).toBe('assign');
    expect(localStorage.getItem('rayenz-order-reconcile-sess-1')).toBe(null);
  });

  it('loadReviewProgress returns empty object when missing; ignores legacy localStorage', () => {
    expect(HubStorage.loadReviewProgress('MSH-2026')).toEqual({
      decisions: {},
      currentDeckId: null,
      currentSuggestionIndex: {},
    });
    localStorage.setItem('rayenz-deck-review-MSH-2026', JSON.stringify({ decisions: { stale: true } }));
    expect(HubStorage.loadReviewProgress('MSH-2026').decisions).toEqual({});
  });
});

describe('HubStorage MTG settings memory vs API', () => {
  it('saveOrderReconcileSettings writes memory only (settings domains own API push)', () => {
    enableHubApi();
    const fetchMock = vi.fn(async () => jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);
    HubStorage.saveOrderReconcileSettings({ folderUrl: 'https://archidekt.com' });
    expect(HubStorage.loadOrderReconcileSettings().folderUrl).toBe('https://archidekt.com');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(localStorage.getItem('rayenz-order-reconcile-settings')).toBe(null);
  });

  it('saveDeckSuggestSettings writes memory only (settings domains own API push)', () => {
    enableHubApi();
    const fetchMock = vi.fn(async () => jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);
    HubStorage.saveDeckSuggestSettings({ setCodes: 'MSH' });
    expect(HubStorage.loadDeckSuggestSettings().setCodes).toBe('MSH');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(localStorage.getItem('rayenz-deck-suggest-settings')).toBe(null);
  });

  it('saveDeckBuilderSettings writes memory only (settings domains own API push)', () => {
    enableHubApi();
    const fetchMock = vi.fn(async () => jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);
    HubStorage.saveDeckBuilderSettings({ allyThreeColourNames: 'custom' });
    expect(HubStorage.loadDeckBuilderSettings().allyThreeColourNames).toBe('custom');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(localStorage.getItem('rayenz-deck-builder-settings')).toBe(null);
  });

  it('saveDailiesSettings still writes localStorage and pushes when API configured', async () => {
    enableHubApi();
    const fetchMock = vi.fn(async () => jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);
    HubStorage.saveDailiesSettings({ faerieQuest: 'jhudora' });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0][0]).toContain('/v1/settings/dailies');
    expect(localStorage.getItem('rayenz-dailies-settings')).toContain('jhudora');
  });

  it('saveDailiesSettings ignores API push failures', () => {
    enableHubApi();
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('offline');
    }));
    expect(() => HubStorage.saveDailiesSettings(null as never)).not.toThrow();
  });
});

describe('HubStorage hydrateReviewProgressFromApi edge cases', () => {
  it('returns memory when fileId empty or API disabled', async () => {
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

  it('falls back to memory when remote null or fetch fails', async () => {
    HubStorage.saveReviewProgress('MSH-2026', {
      decisions: { local: true },
      currentDeckId: null,
      currentSuggestionIndex: {},
    });
    enableHubApi();
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse('', { status: 404, ok: false })));
    await expect(HubStorage.hydrateReviewProgressFromApi('MSH-2026')).resolves.toMatchObject({
      decisions: { local: true },
    });

    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse('err', { status: 500, ok: false })));
    await expect(HubStorage.hydrateReviewProgressFromApi('MSH-2026')).resolves.toMatchObject({
      decisions: { local: true },
    });
  });
});

describe('HubStorage hydrateSetPoolFromApi edge cases', () => {
  it('returns memory cache when API disabled or remote incomplete', async () => {
    const scope = { complete: true, codes: ['MSH'], codesKey: 'MSH', cards: [{ name: 'A' }] };
    HubStorage.saveSetPoolCache('MSH', scope);
    const stamped = { ...scope, formatVersion: 3 };
    await expect(HubStorage.hydrateSetPoolFromApi('MSH')).resolves.toEqual(stamped);

    enableHubApi();
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ complete: false, cards: [] })));
    await expect(HubStorage.hydrateSetPoolFromApi('MSH')).resolves.toEqual(stamped);

    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse('', { status: 404, ok: false })));
    await expect(HubStorage.hydrateSetPoolFromApi('MSH')).resolves.toEqual(stamped);
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
    const api = {
      getMainPet: () => 'Fluffy',
      getMainPetSlug: () => '',
      getWishlists: () => [],
      saveMainPet: () => {},
    };
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

  it('API-off client-only path works without auth', () => {
    localStorage.clear();
    expect(getHubApiConfig().enabled).toBe(false);
    HubStorage.saveDailiesSettings({ wishlists: ['x'] });
    expect(JSON.parse(localStorage.getItem('rayenz-dailies-settings') || '{}')).toMatchObject({
      wishlists: ['x'],
    });
  });
});
