const ACCESS_KEY = 'rayenz-hub-access-token';
const ID_KEY = 'rayenz-hub-id-token';
const REFRESH_KEY = 'rayenz-hub-refresh-token';
const USERNAME_KEY = 'rayenz-hub-username';
const SUB_KEY = 'rayenz-hub-sub';

export const HUB_AUTH_REQUIRED_EVENT = 'hub-auth-required';
export const HUB_AUTH_CHANGED_EVENT = 'hub-auth-changed';

function dispatchAuthChanged(): void {
  try {
    window.dispatchEvent(new CustomEvent(HUB_AUTH_CHANGED_EVENT));
  } catch {
    /* ignore */
  }
}

export type HubAuthSession = {
  accessToken: string;
  idToken?: string;
  refreshToken?: string;
  username?: string;
  sub?: string;
};

function storageGet(key: string): string {
  try {
    return sessionStorage.getItem(key) || localStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

function storageSet(key: string, value: string): void {
  try {
    if (value) sessionStorage.setItem(key, value);
    else sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function getHubAuthSession(): HubAuthSession | null {
  const accessToken = storageGet(ACCESS_KEY);
  if (!accessToken) return null;
  return {
    accessToken,
    idToken: storageGet(ID_KEY) || undefined,
    refreshToken: storageGet(REFRESH_KEY) || undefined,
    username: storageGet(USERNAME_KEY) || undefined,
    sub: storageGet(SUB_KEY) || undefined,
  };
}

export function getAccessToken(): string {
  return storageGet(ACCESS_KEY);
}

export function setHubAuthSession(session: HubAuthSession): void {
  storageSet(ACCESS_KEY, session.accessToken);
  storageSet(ID_KEY, session.idToken || '');
  storageSet(REFRESH_KEY, session.refreshToken || '');
  storageSet(USERNAME_KEY, session.username || '');
  storageSet(SUB_KEY, session.sub || '');
  dispatchAuthChanged();
}

export function clearHubAuthSession(): void {
  storageSet(ACCESS_KEY, '');
  storageSet(ID_KEY, '');
  storageSet(REFRESH_KEY, '');
  storageSet(USERNAME_KEY, '');
  storageSet(SUB_KEY, '');
  try {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(ID_KEY);
    localStorage.removeItem(REFRESH_KEY);
  } catch {
    /* ignore */
  }
  dispatchAuthChanged();
}

export function notifyAuthRequired(): void {
  clearHubAuthSession();
  try {
    window.dispatchEvent(new CustomEvent(HUB_AUTH_REQUIRED_EVENT));
  } catch {
    /* ignore */
  }
}

/** Exchange a stored refresh token for a new access token. Returns null on failure. */
export async function tryRefreshAccessToken(apiUrl: string): Promise<string | null> {
  const session = getHubAuthSession();
  const refreshToken = session?.refreshToken;
  if (!refreshToken || !apiUrl) {
    return null;
  }
  try {
    const res = await fetch(`${apiUrl.replace(/\/$/, '')}/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ refreshToken, username: session.username }),
    });
    if (!res.ok) {
      return null;
    }
    const body = JSON.parse(await res.text()) as {
      accessToken?: string;
      idToken?: string;
      refreshToken?: string;
      username?: string;
      sub?: string;
    };
    if (!body.accessToken) {
      return null;
    }
    setHubAuthSession({
      accessToken: body.accessToken,
      idToken: body.idToken || session.idToken,
      refreshToken: body.refreshToken || refreshToken,
      username: body.username || session.username,
      sub: body.sub || session.sub,
    });
    return body.accessToken;
  } catch {
    return null;
  }
}

export class HubAuthRequiredError extends Error {
  constructor(message = 'Hub API sign-in required') {
    super(message);
    this.name = 'HubAuthRequiredError';
  }
}
