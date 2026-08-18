import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  assertApiNotPageOrigin,
  clientApiFetch,
  clearHubApiConfig,
  getHubApiConfig,
  HubApiClient,
  isApiConfigured,
  parseHubApiJsonBody,
  pullProfileYaml,
  pullPublicProfileYaml,
  pullSettings,
  pushSettingsDomain,
  resolveHubApiUrl,
  setHubApiConfig,
  syncDailiesSettingsFromApi,
} from '../../../packages/web/src/api/hub-api-client.ts';
import { HubStorage } from '../../../packages/web/src/lib/hub-storage.ts';
import { ProfileSync } from '../../../packages/web/src/mtg/profile-sync.ts';
import {
  persistDeckBuilderSettings,
  persistDailiesSettings,
} from '../../../packages/web/src/api/hub-api.ts';
import { getAccessToken, getHubAuthSession, setHubAuthSession } from '../../../packages/web/src/lib/hub-auth-session.ts';
import {
  enableHubApi,
  installHubApiGlobalsLifecycle,
  jsonResponse,
} from '../helpers/hubHarness.ts';

installHubApiGlobalsLifecycle();

describe('HubApiClient config and parsing', () => {
  it('getHubApiConfig returns disabled when url or session missing', () => {
    expect(getHubApiConfig()).toEqual({ url: '', enabled: false });
    expect(isApiConfigured()).toBe(false);
    localStorage.setItem('rayenz-hub-api-url', 'http://127.0.0.1:3000');
    expect(getHubApiConfig().enabled).toBe(false);
  });

  it('getHubApiConfig strips trailing slash and enables when URL and session are set', () => {
    localStorage.setItem('rayenz-hub-api-url', 'http://127.0.0.1:3000/');
    setHubAuthSession({ accessToken: 'test-access-token' });
    expect(getHubApiConfig()).toEqual({
      url: 'http://127.0.0.1:3000',
      enabled: true,
    });
    expect(isApiConfigured()).toBe(true);
  });

  it('enables API mode when only a refresh token is stored', () => {
    localStorage.setItem('rayenz-hub-api-url', 'http://127.0.0.1:3000');
    setHubAuthSession({ accessToken: '', refreshToken: 'refresh-me', username: 'Rayenz' });
    expect(getHubApiConfig().enabled).toBe(true);
    expect(isApiConfigured()).toBe(true);
  });

  it('strips a leftover operator key and does not enable API mode from it', () => {
    localStorage.setItem('rayenz-hub-api-url', 'http://127.0.0.1:3000');
    localStorage.setItem('rayenz-hub-api-key', 'test-api-key-local');
    expect(getHubApiConfig()).toEqual({
      url: 'http://127.0.0.1:3000',
      enabled: false,
    });
    expect(localStorage.getItem('rayenz-hub-api-key')).toBe(null);
  });

  it('setHubApiConfig writes and strips trailing slash; empty clears the URL', () => {
    expect(setHubApiConfig({ url: 'http://127.0.0.1:3000/' })).toEqual({
      url: 'http://127.0.0.1:3000',
      enabled: false,
    });
    expect(localStorage.getItem('rayenz-hub-api-url')).toBe('http://127.0.0.1:3000');

    setHubAuthSession({ accessToken: 'test-access-token' });
    expect(getHubApiConfig().enabled).toBe(true);

    expect(setHubApiConfig({ url: '' })).toEqual({
      url: '',
      enabled: false,
    });
    expect(localStorage.getItem('rayenz-hub-api-url')).toBe(null);
  });

  it('clearHubApiConfig removes the URL and leftover key', () => {
    enableHubApi();
    localStorage.setItem('rayenz-hub-api-key', 'stale');
    clearHubApiConfig();
    expect(getHubApiConfig()).toEqual({ url: '', enabled: false });
    expect(localStorage.getItem('rayenz-hub-api-url')).toBe(null);
    expect(localStorage.getItem('rayenz-hub-api-key')).toBe(null);
  });

  it('resolveHubApiUrl prefers baked env over stored and dev hostname', () => {
    expect(
      resolveHubApiUrl({
        baked: 'https://api.example/',
        dev: true,
        mode: 'development',
        hostname: '192.168.1.5',
        stored: 'http://127.0.0.1:3000',
      }),
    ).toBe('https://api.example');
  });

  it('resolveHubApiUrl uses hostname:3000 in Vite dev', () => {
    expect(
      resolveHubApiUrl({
        baked: '',
        dev: true,
        mode: 'development',
        hostname: '192.168.1.5',
        stored: 'http://stale.example',
      }),
    ).toBe('http://192.168.1.5:3000');
  });

  it('resolveHubApiUrl uses localStorage in test mode', () => {
    expect(
      resolveHubApiUrl({
        baked: '',
        dev: true,
        mode: 'test',
        hostname: 'localhost',
        stored: 'http://127.0.0.1:3000/',
      }),
    ).toBe('http://127.0.0.1:3000');
  });

  it('getHubApiConfig prefers baked VITE_HUB_API_URL over leftover localStorage', () => {
    localStorage.setItem('rayenz-hub-api-url', 'http://stale.example');
    vi.stubEnv('VITE_HUB_API_URL', 'https://prod.example.execute-api.us-east-1.amazonaws.com/');
    expect(getHubApiConfig()).toEqual({
      url: 'https://prod.example.execute-api.us-east-1.amazonaws.com',
      enabled: false,
    });
    vi.unstubAllEnvs();
  });

  it('assertApiNotPageOrigin throws when api url matches page origin', () => {
    const origin = location.origin.replace(/\/$/, '');
    expect(() => assertApiNotPageOrigin('http://127.0.0.1:3000')).not.toThrow();
    expect(() => assertApiNotPageOrigin(origin)).toThrow(/Hub API URL is set to this page's origin/);
  });

  it('parseHubApiJsonBody rejects HTML, accepts empty, parses JSON', () => {
    expect(() => parseHubApiJsonBody('<html><body>oops</body></html>', 'http://x/y', 'http://x')).toThrow(
      /returned HTML instead of JSON/,
    );
    expect(parseHubApiJsonBody('', 'http://x/y', 'http://x')).toBe(null);
    expect(parseHubApiJsonBody('  \n  ', 'http://x/y', 'http://x')).toBe(null);
    expect(parseHubApiJsonBody('{"ok":true}', 'http://x/y', 'http://x')).toEqual({ ok: true });
  });
});

describe('clientApiFetch', () => {
  it('rejects when API is not configured', async () => {
    await expect(clientApiFetch('/v1/settings/dailies')).rejects.toThrow('Hub API not configured');
  });

  it('throws on 401 unauthorized', async () => {
    enableHubApi();
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse('denied', { status: 401, ok: false })));
    await expect(clientApiFetch('/v1/settings/dailies')).rejects.toThrow('Hub API unauthorized');
  });

  it('returns null on 404', async () => {
    enableHubApi();
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse('', { status: 404, ok: false })));
    await expect(clientApiFetch('/v1/profiles/missing')).resolves.toBe(null);
  });

  it('throws on non-ok status with body peek', async () => {
    enableHubApi();
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse('server blew up', { status: 500, ok: false })));
    await expect(clientApiFetch('/v1/settings/dailies')).rejects.toThrow('Hub API error 500: server blew up');
  });

  it('throws when ok response body is HTML', async () => {
    enableHubApi();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse('<!DOCTYPE html><html></html>', { status: 200, ok: true })),
    );
    await expect(clientApiFetch('/v1/settings/dailies')).rejects.toThrow(/returned HTML instead of JSON/);
  });

  it('returns parsed JSON on success', async () => {
    enableHubApi();
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ payload: { faerieQuest: 'jhudora' } })));
    await expect(clientApiFetch('/v1/settings/dailies')).resolves.toEqual({ payload: { faerieQuest: 'jhudora' } });
  });

  it('rejects when api url equals page origin', async () => {
    localStorage.setItem('rayenz-hub-api-url', location.origin.replace(/\/$/, ''));
    setHubAuthSession({ accessToken: 'test-access-token' });
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({})));
    await expect(clientApiFetch('/v1/settings/dailies')).rejects.toThrow(/Hub API URL is set to this page's origin/);
  });

  it('refreshes the access token once on 401 then retries', async () => {
    enableHubApi();
    setHubAuthSession({
      accessToken: 'expired-token',
      refreshToken: 'refresh-me',
      username: 'Rayenz',
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/v1/auth/refresh')) {
        return jsonResponse({
          accessToken: 'new-token',
          refreshToken: 'refresh-me',
          username: 'Rayenz',
          sub: 'rayenz-sub',
          expiresIn: 3600,
        });
      }
      const headers = init?.headers as Record<string, string> | undefined;
      if (headers?.Authorization === 'Bearer expired-token') {
        return jsonResponse('denied', { status: 401, ok: false });
      }
      return jsonResponse({ payload: { ok: true } });
    });
    vi.stubGlobal('fetch', fetchMock);
    await expect(clientApiFetch('/v1/settings/dailies')).resolves.toEqual({ payload: { ok: true } });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('does not wipe the session when refresh fails with a network error', async () => {
    enableHubApi();
    setHubAuthSession({
      accessToken: 'expired-token',
      refreshToken: 'refresh-me',
      username: 'Rayenz',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).endsWith('/v1/auth/refresh')) {
          throw new Error('network');
        }
        return jsonResponse('denied', { status: 401, ok: false });
      }),
    );
    await expect(clientApiFetch('/v1/settings/dailies')).rejects.toThrow('Hub API unauthorized');
    expect(getHubAuthSession()?.refreshToken).toBe('refresh-me');
  });

  it('wipes the session when refresh returns 401', async () => {
    enableHubApi();
    setHubAuthSession({
      accessToken: 'expired-token',
      refreshToken: 'stale-refresh',
      username: 'Rayenz',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        if (String(input).endsWith('/v1/auth/refresh')) {
          return jsonResponse('denied', { status: 401, ok: false });
        }
        return jsonResponse('denied', { status: 401, ok: false });
      }),
    );
    await expect(clientApiFetch('/v1/settings/dailies')).rejects.toThrow('Hub API unauthorized');
    expect(getHubAuthSession()).toBeNull();
  });

  it('refreshes a refresh-only session before the first API call', async () => {
    localStorage.setItem('rayenz-hub-api-url', 'http://127.0.0.1:3000');
    setHubAuthSession({
      accessToken: '',
      refreshToken: 'refresh-me',
      username: 'Rayenz',
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith('/v1/auth/refresh')) {
        return jsonResponse({ accessToken: 'new-token', refreshToken: 'refresh-me' });
      }
      return jsonResponse({ payload: { ok: true } });
    });
    vi.stubGlobal('fetch', fetchMock);
    await expect(clientApiFetch('/v1/settings/dailies')).resolves.toEqual({ payload: { ok: true } });
    expect(getAccessToken()).toBe('new-token');
  });
});

describe('HubApiClient settings and profiles', () => {
  it('pullSettings returns payload when present', async () => {
    enableHubApi();
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ payload: { folderUrl: 'x' } })));
    await expect(pullSettings('deck-suggest')).resolves.toEqual({ folderUrl: 'x' });
  });

  it('pullSettings returns null when payload missing', async () => {
    enableHubApi();
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ payload: null })));
    await expect(pullSettings('deck-suggest')).resolves.toBe(null);
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(null)));
    await expect(pullSettings('deck-suggest')).resolves.toBe(null);
  });

  it('pushSettingsDomain PUTs payload wrapper', async () => {
    enableHubApi();
    const fetchMock = vi.fn(async () => jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    await pushSettingsDomain('dailies', { faerieQuest: 'illusen' });
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:3000/v1/settings/dailies');
    expect(opts.method).toBe('PUT');
    expect(JSON.parse(opts.body)).toEqual({ payload: { faerieQuest: 'illusen' } });
  });

  it('pullProfileYaml returns yaml or null', async () => {
    enableHubApi();
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ yaml: 'protected_cards: []\n' })));
    await expect(pullProfileYaml('deck-1')).resolves.toBe('protected_cards: []\n');

    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ deckId: 'deck-1' })));
    await expect(pullProfileYaml('deck-1')).resolves.toBe(null);

    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse('', { status: 404, ok: false })));
    await expect(pullProfileYaml('missing')).resolves.toBe(null);
  });

  it('pullPublicProfileYaml uses the unauthenticated public profile path', async () => {
    localStorage.setItem('rayenz-hub-api-url', 'http://127.0.0.1:3000');
    const fetchMock = vi.fn(async () => jsonResponse({ yaml: 'tags:\n  - aggro\n', deckId: 'cmd-1' }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(pullPublicProfileYaml('rayenz', 'fixture-commander')).resolves.toBe(
      'tags:\n  - aggro\n',
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:3000/v1/users/rayenz/decks/fixture-commander/profile',
      expect.objectContaining({ method: 'GET' }),
    );

    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse('', { status: 404, ok: false })));
    await expect(pullPublicProfileYaml('rayenz', 'missing')).resolves.toBe(null);
  });
});

describe('syncDailiesSettingsFromApi', () => {
  it('uses fallback when API disabled', async () => {
    const fallback = vi.fn(() => ({ local: true }));
    await expect(syncDailiesSettingsFromApi(fallback)).resolves.toEqual({ local: true });
    expect(fallback).toHaveBeenCalledOnce();
  });

  it('returns null when API disabled and no fallback', async () => {
    await expect(syncDailiesSettingsFromApi()).resolves.toBe(null);
  });

  it('saves payload and applies main pet on success', async () => {
    enableHubApi();
    const saveDailiesSettings = vi.fn();
    const saveMainPet = vi.fn();
    (window as Window & { HubStorage?: { saveDailiesSettings?: (p: unknown) => void } }).HubStorage = {
      saveDailiesSettings,
    };
    (window as Window & { DailiesSettings?: { saveMainPet?: (n: string, s: string | null) => void } }).DailiesSettings =
      { saveMainPet };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ payload: { faerieQuest: 'illusen', mainPetName: 'Fluffy', mainPetSlug: 'fluffy' } })),
    );

    const payload = await syncDailiesSettingsFromApi(() => ({ fallback: true }));
    expect(payload).toEqual({ faerieQuest: 'illusen', mainPetName: 'Fluffy', mainPetSlug: 'fluffy' });
    expect(saveDailiesSettings).toHaveBeenCalledWith(payload);
    expect(saveMainPet).toHaveBeenCalledWith('Fluffy', 'fluffy');
  });

  it('falls back when payload missing or HubStorage.saveDailiesSettings absent', async () => {
    enableHubApi();
    const fallback = vi.fn(() => 'fb');
    delete (window as Window & { HubStorage?: unknown }).HubStorage;

    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ payload: null })));
    await expect(syncDailiesSettingsFromApi(fallback)).resolves.toBe('fb');

    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ payload: { faerieQuest: 'illusen' } })));
    await expect(syncDailiesSettingsFromApi(fallback)).resolves.toBe('fb');
    expect(fallback).toHaveBeenCalledTimes(2);
  });

  it('falls back on fetch error', async () => {
    enableHubApi();
    const fallback = vi.fn(() => 'caught');
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse('fail', { status: 500, ok: false })));
    await expect(syncDailiesSettingsFromApi(fallback)).resolves.toBe('caught');
  });

  it('applyMainPetFromPayload skips empty name and missing saveMainPet', async () => {
    enableHubApi();
    const saveDailiesSettings = vi.fn();
    const saveMainPet = vi.fn();
    (window as Window & { HubStorage?: { saveDailiesSettings?: (p: unknown) => void } }).HubStorage = {
      saveDailiesSettings,
    };

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ payload: { mainPetName: '  ', mainPetSlug: 'x' } })),
    );
    await syncDailiesSettingsFromApi();
    expect(saveMainPet).not.toHaveBeenCalled();

    (window as Window & { DailiesSettings?: { saveMainPet?: (n: string, s: string | null) => void } }).DailiesSettings =
      { saveMainPet };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ payload: { mainPetName: 'Bob', mainPetSlug: '  ' } })),
    );
    await syncDailiesSettingsFromApi();
    expect(saveMainPet).toHaveBeenCalledWith('Bob', null);

    (window as Window & { DailiesSettings?: Record<string, unknown> }).DailiesSettings = {};
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ payload: { mainPetName: 'Zara', mainPetSlug: 'zara' } })),
    );
    await syncDailiesSettingsFromApi();
    expect(saveMainPet).toHaveBeenCalledTimes(1);
  });
});

describe('HubApiClient review progress and set pools', () => {
  it('pullReviewProgress normalizes missing fields', async () => {
    enableHubApi();
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ currentDeckId: null })));
    await expect(HubApiClient.pullReviewProgress('MSH-2026')).resolves.toEqual({
      decisions: {},
      currentDeckId: null,
      currentSuggestionIndex: {},
    });
  });

  it('pushReviewProgress and pushSetPool send PUT bodies', async () => {
    enableHubApi();
    const fetchMock = vi.fn(async () => jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    await HubApiClient.pushReviewProgress('MSH-2026', { decisions: { s1: 'accept' } });
    await HubApiClient.pushSetPool('MAR,MSH', {
      complete: true,
      codes: ['MAR', 'MSH'],
      cards: [{ name: 'A' }],
      primaryCode: 'MSH',
      setName: 'Marvel',
    });

    const reviewPut = fetchMock.mock.calls.find((c) => String(c[0]).includes('/v1/review-progress/'));
    expect(JSON.parse(reviewPut![1].body).decisions).toEqual({ s1: 'accept' });
    const poolPut = fetchMock.mock.calls.find((c) => String(c[0]).includes('/v1/set-pools/'));
    expect(JSON.parse(poolPut![1].body).primaryCode).toBe('MSH');
  });

  it('pullSetPool returns complete remote scope', async () => {
    enableHubApi();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          complete: true,
          codes: ['MSH'],
          codesKey: 'MSH',
          primaryCode: 'MSH',
          setName: 'Marvel Super Heroes',
          cards: [{ name: 'A' }],
          formatVersion: 2,
        }),
      ),
    );
    await expect(HubApiClient.pullSetPool('MSH')).resolves.toEqual({
      complete: true,
      codes: ['MSH'],
      codesKey: 'MSH',
      primaryCode: 'MSH',
      setName: 'Marvel Super Heroes',
      cards: [{ name: 'A' }],
      formatVersion: 2,
    });
  });
});

describe('HubApiClient persistence helpers', () => {
  it('pushProfile PUTs yaml body', async () => {
    enableHubApi();
    const fetchMock = vi.fn(async () =>
      jsonResponse({ deckId: 'deck-1', yaml: 'protected_cards:\n  - Sol Ring\n' }),
    );
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
    enableHubApi();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          fileId: 'MSH-2026',
          decisions: { s1: 'accept' },
          currentDeckId: 'deck-1',
          currentSuggestionIndex: { 'deck-1': 2 },
        }),
      ),
    );

    const progress = await HubApiClient.pullReviewProgress('MSH-2026');
    expect(progress).toEqual({
      decisions: { s1: 'accept' },
      currentDeckId: 'deck-1',
      currentSuggestionIndex: { 'deck-1': 2 },
    });
  });

  it('pullSetPool returns null for incomplete pools', async () => {
    enableHubApi();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ codesKey: 'MSH', complete: false, cards: [] })),
    );
    expect(await HubApiClient.pullSetPool('MSH')).toBe(null);
  });
});

describe('HubStorage dual-mode sync', () => {
  it('saveSetPoolCache pushes complete scopes', async () => {
    enableHubApi();
    const fetchMock = vi.fn(async () => jsonResponse({}));
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
    expect(localStorage.getItem('rayenz-deck-suggest-set-pool-MSH')).toBe(null);
  });
});

describe('MTG settings API-or-nothing', () => {
  it('persistDeckBuilderSettings throws when API is off', async () => {
    await expect(
      persistDeckBuilderSettings({
        allyThreeColourNames: 'shards',
        enemyThreeColourNames: 'wedges',
      }),
    ).rejects.toThrow('Hub API not configured');
    expect(localStorage.getItem('rayenz-deck-builder-settings')).toBe(null);
  });

  it('persistDailiesSettings still allows local when API is off', async () => {
    await expect(persistDailiesSettings({ faerieQuest: 'jhudora' })).resolves.toBe('local');
    expect(localStorage.getItem('rayenz-dailies-settings')).toContain('jhudora');
  });
});

describe('ProfileSync API write path', () => {
  it('canWriteProfiles is true when API configured on mobile UA', () => {
    enableHubApi();
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
    enableHubApi();
    const yaml = 'protected_cards:\n  - Sol Ring\nblocked_cards: []\n';
    const fetchMock = vi.fn(async (_url, opts) => {
      if (!opts || opts.method === 'GET' || !opts.method) {
        return jsonResponse({ yaml });
      }
      return jsonResponse({ deckId: 'deck-1', yaml: opts.body });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await ProfileSync.appendToProfileList('deck-1', 'blocked_cards', 'Mana Crypt');
    expect(result.changed).toBe(true);
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    const putCall = fetchMock.mock.calls.find((c) => c[1] && c[1].method === 'PUT');
    expect(putCall).toBeTruthy();
    const body = JSON.parse(putCall![1].body);
    expect(body.yaml).toContain('Mana Crypt');
    expect(body.blockedCards).toContain('Mana Crypt');
  });

  it('isConnected resolves true when API enabled', async () => {
    enableHubApi();
    expect(await ProfileSync.isConnected()).toBe(true);
  });
});

describe('ProfileSync.parseYamlList', () => {
  it('parses list items and strips surrounding quotes', () => {
    const yaml = 'protected_cards:\n  - "Sol Ring"\n  - Mana Crypt\nroles:\n  - ramp\n';
    expect(ProfileSync.parseYamlList(yaml, 'protected_cards')).toEqual(['Sol Ring', 'Mana Crypt']);
  });

  it('returns empty when the section is missing', () => {
    expect(ProfileSync.parseYamlList('roles:\n  - ramp\n', 'protected_cards')).toEqual([]);
  });

  it('stops at the next top-level section', () => {
    const yaml = 'blocked_cards:\n  - X\nnotes: ignored\n  - Y\n';
    expect(ProfileSync.parseYamlList(yaml, 'blocked_cards')).toEqual(['X']);
  });
});

describe('ProfileSync.appendToProfileList validation and no-op paths', () => {
  it('rejects missing card name', async () => {
    await expect(ProfileSync.appendToProfileList('deck-1', 'protected_cards', '')).rejects.toThrow(/Missing deck/);
  });

  it('returns changed false when the card already exists via API', async () => {
    enableHubApi();
    const yaml = 'protected_cards:\n  - Sol Ring\n';
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ yaml })));
    const result = await ProfileSync.appendToProfileList('deck-1', 'protected_cards', 'Sol Ring');
    expect(result.changed).toBe(false);
  });

  it('creates a new yaml section when the field is absent via API', async () => {
    enableHubApi();
    const fetchMock = vi.fn(async (_url, opts) => {
      if (!opts?.method || opts.method === 'GET') {
        return jsonResponse({ yaml: 'roles:\n  - ramp\n' });
      }
      return jsonResponse({ deckId: 'deck-1' });
    });
    vi.stubGlobal('fetch', fetchMock);
    const result = await ProfileSync.appendToProfileList('deck-1', 'protected_cards', 'Sol Ring');
    expect(result.changed).toBe(true);
    const putCall = fetchMock.mock.calls.find((c) => c[1]?.method === 'PUT');
    expect(JSON.parse(putCall![1].body).yaml).toContain('protected_cards:');
  });
});

describe('ProfileSync.appendToProfileLists', () => {
  it('appends multiple yaml lists in one pull/push', async () => {
    enableHubApi();
    const fetchMock = vi.fn(async (_url, opts) => {
      if (!opts?.method || opts.method === 'GET') {
        return jsonResponse({ yaml: 'themes:\n  - tokens\n' });
      }
      return jsonResponse({ deckId: 'deck-1' });
    });
    vi.stubGlobal('fetch', fetchMock);
    const result = await ProfileSync.appendToProfileLists('deck-1', {
      themes: ['ramp'],
      keyword_interests: ['landfall'],
      typal_types: ['Elf'],
      art_tags: ['tree'],
    });
    expect(result.changed).toBe(true);
    const putCall = fetchMock.mock.calls.find((c) => c[1]?.method === 'PUT');
    const yaml = JSON.parse(putCall![1].body).yaml as string;
    expect(yaml).toContain('  - ramp');
    expect(yaml).toContain('keyword_interests:');
    expect(yaml).toContain('typal_types:');
    expect(yaml).toContain('art_tags:');
  });
});

describe('ProfileSync read and connect paths', () => {
  function installFakeIndexedDb(storedHandle: FileSystemDirectoryHandle | undefined = undefined) {
    vi.stubGlobal('indexedDB', {
      open() {
        const request = {
          result: {
            createObjectStore() {},
            transaction() {
              const tx = {
                oncomplete: null as (() => void) | null,
                onerror: null as (() => void) | null,
                objectStore() {
                  return {
                    get() {
                      const req = {
                        onsuccess: null as (() => void) | null,
                        onerror: null as (() => void) | null,
                        result: storedHandle,
                      };
                      queueMicrotask(() => req.onsuccess?.());
                      return req;
                    },
                    put() {},
                  };
                },
              };
              queueMicrotask(() => tx.oncomplete?.());
              return tx;
            },
          },
          onsuccess: null as (() => void) | null,
          onupgradeneeded: null as ((ev: { result: unknown }) => void) | null,
          onerror: null as (() => void) | null,
        };
        queueMicrotask(() => {
          request.onupgradeneeded?.({ result: request.result });
          request.onsuccess?.();
        });
        return request;
      },
    });
  }

  function mockDirHandle(yaml: string) {
    const writable = {
      write: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const fileHandle = {
      getFile: vi.fn().mockResolvedValue({ text: () => Promise.resolve(yaml) }),
      createWritable: vi.fn().mockResolvedValue(writable),
    };
    return {
      handle: {
        getFileHandle: vi.fn().mockResolvedValue(fileHandle),
        queryPermission: vi.fn().mockResolvedValue('granted'),
        requestPermission: vi.fn().mockResolvedValue('granted'),
      } as unknown as FileSystemDirectoryHandle,
      writable,
    };
  }

  beforeEach(() => {
    installFakeIndexedDb(undefined);
  });

  it('canWriteProfiles is true on desktop when directory picker exists', () => {
    vi.stubGlobal('showDirectoryPicker', vi.fn());
    expect(ProfileSync.canWriteProfiles()).toBe(true);
    expect(ProfileSync.canWriteProfilesViaDirectory()).toBe(true);
  });

  it('canWriteProfiles is false on mobile without API', () => {
    const original = navigator.userAgent;
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      get: () => 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
    });
    expect(ProfileSync.canWriteProfiles()).toBe(false);
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      get: () => original,
    });
  });

  it('connectProfilesDir rejects when directory picker is unavailable', async () => {
    vi.stubGlobal('showDirectoryPicker', undefined);
    await expect(ProfileSync.connectProfilesDir()).rejects.toThrow(/desktop Chrome/);
  });

  it('isConnected resolves false without API or connected directory', async () => {
    installFakeIndexedDb(undefined);
    expect(await ProfileSync.isConnected()).toBe(false);
  });

  it('readProfileYaml reads from directory when API is disabled', async () => {
    const { handle } = mockDirHandle('protected_cards:\n  - Sol Ring\n');
    installFakeIndexedDb(handle);
    await expect(ProfileSync.readProfileYaml('deck-1')).resolves.toContain('Sol Ring');
  });

  it('readProfileYaml falls back to directory when API returns no yaml', async () => {
    enableHubApi();
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ deckId: 'deck-1' })));
    const { handle } = mockDirHandle('protected_cards:\n  - From Dir\n');
    installFakeIndexedDb(handle);
    await expect(ProfileSync.readProfileYaml('deck-1')).resolves.toContain('From Dir');
  });

  it('readProfileYaml falls back to directory when API fetch fails', async () => {
    enableHubApi();
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse('fail', { status: 500, ok: false })));
    const { handle } = mockDirHandle('protected_cards:\n  - Fallback\n');
    installFakeIndexedDb(handle);
    await expect(ProfileSync.readProfileYaml('deck-1')).resolves.toContain('Fallback');
  });

  it('readProfileYaml returns null when no directory is connected', async () => {
    installFakeIndexedDb(undefined);
    await expect(ProfileSync.readProfileYaml('missing')).resolves.toBe(null);
  });

  it('appendToProfileList writes via directory when API is disabled', async () => {
    const yaml = 'protected_cards:\n  - Sol Ring\n';
    const { handle, writable } = mockDirHandle(yaml);
    installFakeIndexedDb(handle);
    const result = await ProfileSync.appendToProfileList('deck-1', 'blocked_cards', 'Mana Crypt');
    expect(result.changed).toBe(true);
    expect(writable.write).toHaveBeenCalled();
  });

  it('appendToProfileList via directory returns changed false for duplicates', async () => {
    const yaml = 'protected_cards:\n  - Sol Ring\n';
    const { handle, writable } = mockDirHandle(yaml);
    installFakeIndexedDb(handle);
    const result = await ProfileSync.appendToProfileList('deck-1', 'protected_cards', 'Sol Ring');
    expect(result.changed).toBe(false);
    expect(writable.write).not.toHaveBeenCalled();
  });

  it('appendToProfileList appends to yaml with no anchor sections via directory', async () => {
    const { handle, writable } = mockDirHandle('name: deck\n');
    installFakeIndexedDb(handle);
    const result = await ProfileSync.appendToProfileList('deck-1', 'protected_cards', 'Sol Ring');
    expect(result.changed).toBe(true);
    expect(writable.write).toHaveBeenCalled();
  });

  it('getProfilesDir returns null when permission is denied', async () => {
    const deniedHandle = {
      queryPermission: vi.fn().mockResolvedValue('denied'),
    } as unknown as FileSystemDirectoryHandle;
    installFakeIndexedDb(deniedHandle);
    expect(await ProfileSync.getProfilesDir()).toBe(null);
  });

  it('getProfilesDir returns handle when permission is granted', async () => {
    const { handle } = mockDirHandle('');
    installFakeIndexedDb(handle);
    expect(await ProfileSync.getProfilesDir()).toBe(handle);
  });

  it('getProfilesDir prompts for permission when state is prompt', async () => {
    const { handle } = mockDirHandle('');
    (handle as FileSystemDirectoryHandle & { queryPermission: ReturnType<typeof vi.fn> }).queryPermission = vi
      .fn()
      .mockResolvedValue('prompt');
    (handle as FileSystemDirectoryHandle & { requestPermission: ReturnType<typeof vi.fn> }).requestPermission = vi
      .fn()
      .mockResolvedValue('granted');
    installFakeIndexedDb(handle);
    expect(await ProfileSync.getProfilesDir()).toBe(handle);
  });

  it('getProfilesDir returns null when prompt permission is denied', async () => {
    const { handle } = mockDirHandle('');
    (handle as FileSystemDirectoryHandle & { queryPermission: ReturnType<typeof vi.fn> }).queryPermission = vi
      .fn()
      .mockResolvedValue('prompt');
    (handle as FileSystemDirectoryHandle & { requestPermission: ReturnType<typeof vi.fn> }).requestPermission = vi
      .fn()
      .mockResolvedValue('denied');
    installFakeIndexedDb(handle);
    expect(await ProfileSync.getProfilesDir()).toBe(null);
  });
});
