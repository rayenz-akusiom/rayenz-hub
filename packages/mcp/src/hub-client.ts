/**
 * Thin Hub API client for the MCP server (env-configured Bearer auth).
 */

export type HubClientConfig = {
  url: string;
  key: string;
};

export class HubApiError extends Error {
  readonly status: number;
  readonly body: string;

  constructor(status: number, body: string) {
    super(`Hub API error ${status}: ${body}`);
    this.name = 'HubApiError';
    this.status = status;
    this.body = body;
  }
}

export function loadHubConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): HubClientConfig {
  const url = String(env.HUB_API_URL || '')
    .trim()
    .replace(/\/$/, '');
  const key = String(env.HUB_API_KEY || '').trim();
  if (!url || !key) {
    throw new Error(
      'HUB_API_URL and HUB_API_KEY are required (e.g. http://127.0.0.1:3000 + test-api-key-local)',
    );
  }
  return { url, key };
}

export type HubFetchOptions = {
  method?: string;
  body?: unknown;
  /** When true, 404 returns null instead of throwing. Default true. */
  nullOn404?: boolean;
};

export function createHubClient(config: HubClientConfig) {
  async function hubFetch(path: string, options: HubFetchOptions = {}): Promise<unknown> {
    const nullOn404 = options.nullOn404 !== false;
    const method = options.method || 'GET';
    const headers: Record<string, string> = {
      Authorization: `Bearer ${config.key}`,
      Accept: 'application/json',
    };
    let body: string | undefined;
    if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(options.body);
    }
    const fullUrl = `${config.url}${path.startsWith('/') ? path : `/${path}`}`;
    const res = await fetch(fullUrl, { method, headers, body });
    const text = await res.text();

    if (res.status === 401) {
      throw new HubApiError(401, 'unauthorized');
    }
    if (res.status === 404) {
      if (nullOn404) return null;
      throw new HubApiError(404, text || 'not found');
    }
    if (res.status === 204) {
      return null;
    }
    if (!res.ok) {
      throw new HubApiError(res.status, text);
    }
    const trimmed = text.trimStart();
    if (!trimmed) return null;
    if (trimmed.startsWith('<')) {
      throw new Error(
        `Hub API returned HTML from ${fullUrl}. HUB_API_URL ("${config.url}") may point at the web app, not the API.`,
      );
    }
    return JSON.parse(text);
  }

  return {
    config,
    fetch: hubFetch,
    listDecks: () => hubFetch('/v1/decks'),
    getDeck: (deckId: string) => hubFetch(`/v1/decks/${encodeURIComponent(deckId)}`),
    putDeck: (deckId: string, document: unknown) =>
      hubFetch(`/v1/decks/${encodeURIComponent(deckId)}`, {
        method: 'PUT',
        body: document,
        nullOn404: false,
      }),
    patchDeck: (deckId: string, patch: unknown) =>
      hubFetch(`/v1/decks/${encodeURIComponent(deckId)}`, {
        method: 'PATCH',
        body: patch,
        nullOn404: false,
      }),
    deleteDeck: (deckId: string) =>
      hubFetch(`/v1/decks/${encodeURIComponent(deckId)}`, {
        method: 'DELETE',
        nullOn404: false,
      }),
    listProfiles: () => hubFetch('/v1/profiles'),
    getProfile: (deckId: string) => hubFetch(`/v1/profiles/${encodeURIComponent(deckId)}`),
    putProfile: (deckId: string, body: unknown) =>
      hubFetch(`/v1/profiles/${encodeURIComponent(deckId)}`, {
        method: 'PUT',
        body: body || {},
        nullOn404: false,
      }),
    getSetPool: (codesKey: string) =>
      hubFetch(`/v1/set-pools/${encodeURIComponent(codesKey)}`),
    putSetPool: (codesKey: string, body: unknown) =>
      hubFetch(`/v1/set-pools/${encodeURIComponent(codesKey)}`, {
        method: 'PUT',
        body,
        nullOn404: false,
      }),
    getReviewProgress: (fileId: string) =>
      hubFetch(`/v1/review-progress/${encodeURIComponent(fileId)}`),
    putReviewProgress: (fileId: string, body: unknown) =>
      hubFetch(`/v1/review-progress/${encodeURIComponent(fileId)}`, {
        method: 'PUT',
        body,
        nullOn404: false,
      }),
  };
}

export type HubClient = ReturnType<typeof createHubClient>;
