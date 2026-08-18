/**
 * Low-level Hub API client (port of shared/hub-api-client.js).
 * Higher-level typed settings helpers live in hub-api.ts.
 */

import { SET_POOL_FORMAT_VERSION } from '@rayenz-hub/shared';
import {
  getAccessToken,
  HubAuthRequiredError,
  notifyAuthRequired,
  tryRefreshAccessToken,
} from '../lib/hub-auth-session';

const API_URL_KEY = 'rayenz-hub-api-url';
const LEGACY_API_KEY_KEY = 'rayenz-hub-api-key';

function stripLegacyApiKey(): void {
  try {
    localStorage.removeItem(LEGACY_API_KEY_KEY);
  } catch {
    /* ignore */
  }
}

function normalizeApiUrl(raw: string): string {
  return raw.trim().replace(/\/$/, '');
}

/** Resolve the Hub API base URL. Baked env wins; Vite dev uses the page hostname; tests use localStorage. */
export function resolveHubApiUrl(input: {
  baked?: string;
  dev?: boolean;
  mode?: string;
  hostname?: string;
  stored?: string;
}): string {
  const baked = normalizeApiUrl(input.baked || '');
  if (baked) {
    return baked;
  }
  if (input.dev && input.mode !== 'test') {
    const host = (input.hostname || '').trim();
    if (host) {
      return `http://${host}:3000`;
    }
  }
  return normalizeApiUrl(input.stored || '');
}

function envString(name: string): string {
  const value = (import.meta.env as Record<string, unknown>)[name];
  return typeof value === 'string' ? value : '';
}

function currentHubApiUrlSources(): {
  baked: string;
  dev: boolean;
  mode: string;
  hostname: string;
  stored: string;
} {
  let hostname = '';
  try {
    hostname = typeof location !== 'undefined' ? location.hostname || '' : '';
  } catch {
    /* location unavailable */
  }
  let stored = '';
  try {
    stored = localStorage.getItem(API_URL_KEY) || '';
  } catch {
    /* ignore quota / private mode */
  }
  return {
    baked: envString('VITE_HUB_API_URL'),
    dev: Boolean(import.meta.env.DEV),
    mode: String(import.meta.env.MODE || ''),
    hostname,
    stored,
  };
}

export interface HubApiConfig {
  url: string;
  enabled: boolean;
}

export function getHubApiConfig(): HubApiConfig {
  stripLegacyApiKey();
  const url = resolveHubApiUrl(currentHubApiUrlSources());
  return { url, enabled: !!(url && getAccessToken()) };
}

/** Test helper: persist Hub API base URL to localStorage. Production Pages ignore this when VITE_HUB_API_URL is baked. */
export function setHubApiConfig(input: { url?: string }): HubApiConfig {
  const url = normalizeApiUrl(input.url ?? '');
  try {
    if (url) localStorage.setItem(API_URL_KEY, url);
    else localStorage.removeItem(API_URL_KEY);
  } catch {
    /* ignore quota / private mode */
  }
  stripLegacyApiKey();
  return getHubApiConfig();
}

/** Test helper: remove Hub API URL from localStorage. */
export function clearHubApiConfig(): void {
  try {
    localStorage.removeItem(API_URL_KEY);
  } catch {
    /* ignore */
  }
  stripLegacyApiKey();
}

export function isApiConfigured(): boolean {
  return getHubApiConfig().enabled;
}

export function getHubApiBaseUrl(): string {
  return resolveHubApiUrl(currentHubApiUrlSources());
}

export async function publicApiFetch(path: string): Promise<unknown> {
  const url = getHubApiBaseUrl();
  if (!url) {
    throw new Error('Hub API not configured');
  }
  assertApiNotPageOrigin(url);
  const fullUrl = url + path;
  const res = await fetch(fullUrl, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });
  const peek = await res.text();
  if (res.status === 404 || res.status === 204) {
    return null;
  }
  if (!res.ok) {
    throw new Error('Hub API error ' + res.status + ': ' + peek);
  }
  return parseHubApiJsonBody(peek, fullUrl, url);
}

/** Reject SPA/HTML mistakes before JSON.parse (e.g. API URL set to Vite origin). */
export function assertApiNotPageOrigin(apiUrl: string): void {
  try {
    if (typeof location !== 'undefined' && apiUrl === location.origin.replace(/\/$/, '')) {
      throw new Error(
        `Hub API URL is set to this page's origin (${apiUrl}). It must be the Hub API base (e.g. http://127.0.0.1:3000), not the Vite/web app.`,
      );
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Hub API URL is set')) {
      throw err;
    }
    /* location unavailable (SSR/tests) */
  }
}

export function parseHubApiJsonBody(text: string, fullUrl: string, configuredUrl: string): unknown {
  const trimmed = text.trimStart();
  if (trimmed.startsWith('<')) {
    throw new Error(
      `Hub API returned HTML instead of JSON from ${fullUrl}. Hub API URL ("${configuredUrl}") is likely pointing at the web app — it must be the API base (e.g. http://127.0.0.1:3000).`,
    );
  }
  if (!trimmed) {
    return null;
  }
  return JSON.parse(text);
}

export async function clientApiFetch(path: string, options?: { method?: string; headers?: Record<string, string>; body?: unknown }): Promise<unknown> {
  const cfg = getHubApiConfig();
  let token = getAccessToken();
  if (!cfg.url || !token) {
    return Promise.reject(new Error('Hub API not configured'));
  }
  assertApiNotPageOrigin(cfg.url);
  const opts = options || {};
  const fullUrl = cfg.url + path;
  const body = opts.body != null ? JSON.stringify(opts.body) : undefined;

  async function doFetch(accessToken: string): Promise<Response> {
    return fetch(fullUrl, {
      method: opts.method || 'GET',
      headers: {
        ...(opts.headers || {}),
        Authorization: 'Bearer ' + accessToken,
        'Content-Type': 'application/json',
      },
      body,
    });
  }

  let res = await doFetch(token);
  if (res.status === 401) {
    const refreshed = await tryRefreshAccessToken(cfg.url);
    if (refreshed) {
      token = refreshed;
      res = await doFetch(token);
    }
  }
  const peek = await res.text();
  if (res.status === 401) {
    notifyAuthRequired();
    throw new HubAuthRequiredError('Hub API unauthorized');
  }
  if (res.status === 404 || res.status === 204) {
    return null;
  }
  if (!res.ok) {
    throw new Error('Hub API error ' + res.status + ': ' + peek);
  }
  return parseHubApiJsonBody(peek, fullUrl, cfg.url);
}

export function pullSettings(domain: string): Promise<unknown> {
  return clientApiFetch('/v1/settings/' + domain).then((data) => {
    const d = data as { payload?: unknown } | null;
    return d && d.payload ? d.payload : null;
  });
}

export function pushSettingsDomain(domain: string, payload: unknown): Promise<unknown> {
  return clientApiFetch('/v1/settings/' + domain, {
    method: 'PUT',
    body: { payload },
  });
}

export function pullProfile(deckId: string): Promise<unknown> {
  return clientApiFetch('/v1/profiles/' + encodeURIComponent(deckId));
}

export function pullProfileYaml(deckId: string): Promise<string | null> {
  return pullProfile(deckId).then((data) => {
    const d = data as { yaml?: string } | null;
    return d && d.yaml ? d.yaml : null;
  });
}

export function pushProfile(deckId: string, body: unknown): Promise<unknown> {
  return clientApiFetch('/v1/profiles/' + encodeURIComponent(deckId), {
    method: 'PUT',
    body: body || {},
  });
}

export type ReviewProgressRemote = {
  decisions: Record<string, unknown>;
  currentDeckId: string | null;
  currentSuggestionIndex: Record<string, number>;
};

export function pullReviewProgress(fileId: string): Promise<ReviewProgressRemote | null> {
  return clientApiFetch('/v1/review-progress/' + encodeURIComponent(fileId)).then((data) => {
    if (!data) {
      return null;
    }
    const d = data as ReviewProgressRemote;
    return {
      decisions: d.decisions || {},
      currentDeckId: d.currentDeckId != null ? d.currentDeckId : null,
      currentSuggestionIndex: d.currentSuggestionIndex || {},
    };
  });
}

export function pushReviewProgress(fileId: string, progress: Partial<ReviewProgressRemote>): Promise<unknown> {
  const p = progress || {};
  return clientApiFetch('/v1/review-progress/' + encodeURIComponent(fileId), {
    method: 'PUT',
    body: {
      formatVersion: 1,
      decisions: p.decisions || {},
      currentDeckId: p.currentDeckId != null ? p.currentDeckId : null,
      currentSuggestionIndex: p.currentSuggestionIndex || {},
    },
  });
}

export type SetPoolRemote = {
  complete: boolean;
  codes: string[];
  codesKey: string;
  primaryCode?: string;
  setName?: string;
  cards: unknown[];
  formatVersion?: number;
};

export function pullSetPool(codesKey: string): Promise<SetPoolRemote | null> {
  return clientApiFetch('/v1/set-pools/' + encodeURIComponent(codesKey)).then((data) => {
    if (!data || (data as SetPoolRemote).complete !== true) {
      return null;
    }
    const d = data as SetPoolRemote;
    return {
      complete: true,
      codes: d.codes || [],
      codesKey: d.codesKey || codesKey,
      primaryCode: d.primaryCode,
      setName: d.setName,
      cards: d.cards || [],
      formatVersion: d.formatVersion,
    };
  });
}

export function pushSetPool(codesKey: string, scope: Partial<SetPoolRemote>): Promise<unknown> {
  const s = scope || {};
  return clientApiFetch('/v1/set-pools/' + encodeURIComponent(codesKey), {
    method: 'PUT',
    body: {
      codes: s.codes || String(codesKey).split(',').filter(Boolean),
      complete: s.complete === true,
      primaryCode: s.primaryCode,
      setName: s.setName,
      cards: s.cards || [],
      formatVersion: s.formatVersion || SET_POOL_FORMAT_VERSION,
    },
  });
}

function applyMainPetFromPayload(payload: Record<string, unknown>): void {
  const w = window as Window & {
    DailiesSettings?: { saveMainPet?: (name: string, slug: string | null) => void };
  };
  if (!payload || !w.DailiesSettings?.saveMainPet) {
    return;
  }
  const name = payload.mainPetName != null ? String(payload.mainPetName).trim() : '';
  const slug = payload.mainPetSlug != null ? String(payload.mainPetSlug).trim() : '';
  if (name) {
    w.DailiesSettings.saveMainPet(name, slug || null);
  }
}

export function syncDailiesSettingsFromApi(fallbackLoader?: () => unknown): Promise<unknown> {
  const cfg = getHubApiConfig();
  if (!cfg.enabled) {
    return Promise.resolve(fallbackLoader ? fallbackLoader() : null);
  }
  return pullSettings('dailies')
    .then((payload) => {
      const w = window as Window & {
        HubStorage?: { saveDailiesSettings?: (p: unknown) => void };
      };
      if (!payload || !w.HubStorage?.saveDailiesSettings) {
        return fallbackLoader ? fallbackLoader() : null;
      }
      w.HubStorage.saveDailiesSettings(payload);
      applyMainPetFromPayload(payload as Record<string, unknown>);
      return payload;
    })
    .catch(() => (fallbackLoader ? fallbackLoader() : null));
}

export const HubApiClient = {
  getConfig: getHubApiConfig,
  setConfig: setHubApiConfig,
  clearConfig: clearHubApiConfig,
  apiFetch: clientApiFetch,
  pullSettings,
  pushSettings: pushSettingsDomain,
  pullProfile,
  pullProfileYaml,
  pushProfile,
  pullReviewProgress,
  pushReviewProgress,
  pullSetPool,
  pushSetPool,
  syncDailiesSettingsFromApi,
};
