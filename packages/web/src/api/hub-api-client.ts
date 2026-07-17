/**
 * Low-level Hub API client (port of shared/hub-api-client.js).
 * Higher-level typed settings helpers live in hub-api.ts.
 */

const API_URL_KEY = 'rayenz-hub-api-url';
const API_KEY_KEY = 'rayenz-hub-api-key';

export interface HubApiConfig {
  url: string;
  key: string;
  enabled: boolean;
}

export function getHubApiConfig(): HubApiConfig {
  let url = '';
  let key = '';
  try {
    url = (localStorage.getItem(API_URL_KEY) || '').replace(/\/$/, '');
    key = localStorage.getItem(API_KEY_KEY) || '';
  } catch {
    /* ignore */
  }
  return { url, key, enabled: !!(url && key) };
}

export function isApiConfigured(): boolean {
  return getHubApiConfig().enabled;
}

/** Reject SPA/HTML mistakes before JSON.parse (e.g. API URL set to Vite origin). */
export function assertApiNotPageOrigin(apiUrl: string): void {
  try {
    if (typeof location !== 'undefined' && apiUrl === location.origin.replace(/\/$/, '')) {
      throw new Error(
        `rayenz-hub-api-url is set to this page's origin (${apiUrl}). Set it to the Hub API base (e.g. http://127.0.0.1:3000), not the Vite/web app.`,
      );
    }
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('rayenz-hub-api-url')) {
      throw err;
    }
    /* location unavailable (SSR/tests) */
  }
}

export function parseHubApiJsonBody(text: string, fullUrl: string, configuredUrl: string): unknown {
  const trimmed = text.trimStart();
  if (trimmed.startsWith('<')) {
    throw new Error(
      `Hub API returned HTML instead of JSON from ${fullUrl}. rayenz-hub-api-url ("${configuredUrl}") is likely pointing at the web app — set it to the API base (e.g. http://127.0.0.1:3000).`,
    );
  }
  if (!trimmed) {
    return null;
  }
  return JSON.parse(text);
}

export async function clientApiFetch(path: string, options?: { method?: string; headers?: Record<string, string>; body?: unknown }): Promise<unknown> {
  const cfg = getHubApiConfig();
  if (!cfg.enabled) {
    return Promise.reject(new Error('Hub API not configured'));
  }
  assertApiNotPageOrigin(cfg.url);
  const opts = options || {};
  const headers = {
    ...(opts.headers || {}),
    Authorization: 'Bearer ' + cfg.key,
    'Content-Type': 'application/json',
  };
  const fullUrl = cfg.url + path;
  const res = await fetch(fullUrl, {
    method: opts.method || 'GET',
    headers,
    body: opts.body != null ? JSON.stringify(opts.body) : undefined,
  });
  const peek = await res.text();
  if (res.status === 401) {
    throw new Error('Hub API unauthorized');
  }
  if (res.status === 404) {
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
      formatVersion: s.formatVersion || 1,
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
