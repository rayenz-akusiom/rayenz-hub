import { normalizeUsername } from '@rayenz-hub/shared';

export type HubClientConfig = {
  url: string;
  username: string;
  password: string;
};

type SessionTokens = {
  accessToken: string;
  refreshToken?: string;
  username?: string;
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
  const username = normalizeUsername(String(env.HUB_USERNAME || ''));
  const password = String(env.HUB_PASSWORD || '').trim();
  if (!url) {
    throw new Error('HUB_API_URL is required (e.g. http://127.0.0.1:3000)');
  }
  if (!username) {
    throw new Error('HUB_USERNAME is required (e.g. Rayenz)');
  }
  if (!password) {
    throw new Error('HUB_PASSWORD is required');
  }
  return { url, username, password };
}

export type HubFetchOptions = {
  method?: string;
  body?: unknown;
  /** When true, 404 returns null instead of throwing. Default true. */
  nullOn404?: boolean;
};

async function parseTokenResponse(res: Response, label: string): Promise<SessionTokens> {
  const text = await res.text();
  if (!res.ok) {
    throw new HubApiError(res.status, text || label);
  }
  const body = JSON.parse(text) as {
    accessToken?: string;
    refreshToken?: string;
    username?: string;
  };
  if (!body.accessToken) {
    throw new Error(`${label} response missing accessToken`);
  }
  return {
    accessToken: body.accessToken,
    refreshToken: body.refreshToken,
    username: body.username,
  };
}

export function createHubClient(config: HubClientConfig) {
  let session: SessionTokens | null = null;

  async function signIn(): Promise<SessionTokens> {
    const res = await fetch(`${config.url}/v1/auth/sign-in`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ username: config.username, password: config.password }),
    });
    session = await parseTokenResponse(res, 'sign-in');
    return session;
  }

  async function refresh(): Promise<SessionTokens | null> {
    const refreshToken = session?.refreshToken;
    if (!refreshToken) {
      return null;
    }
    try {
      const res = await fetch(`${config.url}/v1/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ refreshToken, username: session?.username || config.username }),
      });
      if (!res.ok) {
        return null;
      }
      session = await parseTokenResponse(res, 'refresh');
      return session;
    } catch {
      return null;
    }
  }

  async function ensureAccessToken(): Promise<string> {
    if (session?.accessToken) {
      return session.accessToken;
    }
    return (await signIn()).accessToken;
  }

  async function hubFetch(path: string, options: HubFetchOptions = {}): Promise<unknown> {
    const nullOn404 = options.nullOn404 !== false;
    const method = options.method || 'GET';
    const fullUrl = `${config.url}${path.startsWith('/') ? path : `/${path}`}`;
    let requestBody: string | undefined;
    if (options.body !== undefined) {
      requestBody = JSON.stringify(options.body);
    }

    async function doFetch(accessToken: string): Promise<Response> {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      };
      if (requestBody !== undefined) {
        headers['Content-Type'] = 'application/json';
      }
      return fetch(fullUrl, { method, headers, body: requestBody });
    }

    let token = await ensureAccessToken();
    let res = await doFetch(token);
    if (res.status === 401) {
      const refreshed = await refresh();
      if (refreshed) {
        token = refreshed.accessToken;
        res = await doFetch(token);
      } else {
        session = null;
        token = (await signIn()).accessToken;
        res = await doFetch(token);
      }
    }
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
