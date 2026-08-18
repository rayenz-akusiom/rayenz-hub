import { useEffect, useState } from 'react';

const ACCESS_KEY = 'rayenz-hub-access-token';
const ID_KEY = 'rayenz-hub-id-token';
const REFRESH_KEY = 'rayenz-hub-refresh-token';
const USERNAME_KEY = 'rayenz-hub-username';
const SUB_KEY = 'rayenz-hub-sub';
const OWNER_KEY = 'rayenz-hub-is-owner';

const AUTH_KEYS = [ACCESS_KEY, ID_KEY, REFRESH_KEY, USERNAME_KEY, SUB_KEY, OWNER_KEY] as const;

/** Refresh when the access JWT expires within this many seconds. */
export const ACCESS_TOKEN_REFRESH_SKEW_SECONDS = 60;

export const HUB_AUTH_REQUIRED_EVENT = 'hub-auth-required';
export const HUB_AUTH_CHANGED_EVENT = 'hub-auth-changed';
export const OWNER_ONLY_EXPENSIVE_MESSAGE =
  'Owner-only — glance and Suggest generate are disabled for this account';

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
  isOwner?: boolean;
};

export type RefreshAccessTokenResult =
  | { ok: true; accessToken: string }
  | { ok: false; cause: 'invalid' | 'unavailable' };

function migrateSessionKey(key: string): void {
  try {
    const fromSession = sessionStorage.getItem(key);
    if (!fromSession) return;
    localStorage.setItem(key, fromSession);
    sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

function storageGet(key: string): string {
  migrateSessionKey(key);
  try {
    return localStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

function storageSet(key: string, value: string): void {
  try {
    sessionStorage.removeItem(key);
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

function readStoredSession(): HubAuthSession | null {
  const accessToken = storageGet(ACCESS_KEY);
  const refreshToken = storageGet(REFRESH_KEY) || undefined;
  if (!accessToken && !refreshToken) return null;
  const ownerRaw = storageGet(OWNER_KEY);
  return {
    accessToken,
    idToken: storageGet(ID_KEY) || undefined,
    refreshToken,
    username: storageGet(USERNAME_KEY) || undefined,
    sub: storageGet(SUB_KEY) || undefined,
    isOwner: ownerRaw === '1' ? true : ownerRaw === '0' ? false : undefined,
  };
}

export function getHubAuthSession(): HubAuthSession | null {
  return readStoredSession();
}

/** Fail closed: expensive APIs stay hidden until /v1/auth/me says owner. */
export function isHubOwner(): boolean {
  return getHubAuthSession()?.isOwner === true;
}

export function getAccessToken(): string {
  return storageGet(ACCESS_KEY);
}

export function isSignedIn(): boolean {
  return getHubAuthSession() != null;
}

export function setHubAuthSession(session: HubAuthSession): void {
  storageSet(ACCESS_KEY, session.accessToken || '');
  storageSet(ID_KEY, session.idToken || '');
  storageSet(REFRESH_KEY, session.refreshToken || '');
  storageSet(USERNAME_KEY, session.username || '');
  storageSet(SUB_KEY, session.sub || '');
  if (session.isOwner === true) storageSet(OWNER_KEY, '1');
  else if (session.isOwner === false) storageSet(OWNER_KEY, '0');
  else storageSet(OWNER_KEY, '');
  dispatchAuthChanged();
}

export function clearHubAuthSession(): void {
  for (const key of AUTH_KEYS) {
    try {
      sessionStorage.removeItem(key);
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
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

/** JWT `exp` (unix seconds), or null when the token is not a JWT with exp. */
export function readJwtExp(token: string): number | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const payload = JSON.parse(atob(padded)) as { exp?: unknown };
    return typeof payload.exp === 'number' ? payload.exp : null;
  } catch {
    return null;
  }
}

export function shouldRefreshAccessToken(
  accessToken: string,
  nowSeconds = Date.now() / 1000,
): boolean {
  if (!accessToken) return true;
  const exp = readJwtExp(accessToken);
  if (exp == null) return false;
  return exp <= nowSeconds + ACCESS_TOKEN_REFRESH_SKEW_SECONDS;
}

/** Exchange a stored refresh token for a new access token. Does not wipe the session. */
export async function tryRefreshAccessToken(apiUrl: string): Promise<RefreshAccessTokenResult> {
  const session = getHubAuthSession();
  const refreshToken = session?.refreshToken;
  if (!refreshToken || !apiUrl) {
    return { ok: false, cause: 'invalid' };
  }
  try {
    const res = await fetch(`${apiUrl.replace(/\/$/, '')}/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ refreshToken, username: session.username }),
    });
    if (res.status === 400 || res.status === 401) {
      return { ok: false, cause: 'invalid' };
    }
    if (!res.ok) {
      return { ok: false, cause: 'unavailable' };
    }
    const body = JSON.parse(await res.text()) as {
      accessToken?: string;
      idToken?: string;
      refreshToken?: string;
      username?: string;
      sub?: string;
    };
    if (!body.accessToken) {
      return { ok: false, cause: 'unavailable' };
    }
    setHubAuthSession({
      accessToken: body.accessToken,
      idToken: body.idToken || session.idToken,
      refreshToken: body.refreshToken || refreshToken,
      username: body.username || session.username,
      sub: body.sub || session.sub,
      isOwner: session.isOwner,
    });
    return { ok: true, accessToken: body.accessToken };
  } catch {
    return { ok: false, cause: 'unavailable' };
  }
}

/** Refresh when the access token is missing or near expiry. Wipes only if the refresh token is invalid. */
export async function restoreHubAuthSession(apiUrl: string): Promise<void> {
  const session = getHubAuthSession();
  if (!session?.refreshToken || !apiUrl) return;
  if (!shouldRefreshAccessToken(session.accessToken)) return;
  const result = await tryRefreshAccessToken(apiUrl);
  if (!result.ok && result.cause === 'invalid') {
    notifyAuthRequired();
  }
}

export class HubAuthRequiredError extends Error {
  constructor(message = 'Hub API sign-in required') {
    super(message);
    this.name = 'HubAuthRequiredError';
  }
}

/** Re-renders when sign-in, sign-out, or owner hydration updates the session. */
export function useIsHubOwner(): boolean {
  const [owner, setOwner] = useState(isHubOwner);
  useEffect(() => {
    const sync = () => setOwner(isHubOwner());
    window.addEventListener(HUB_AUTH_CHANGED_EVENT, sync);
    window.addEventListener(HUB_AUTH_REQUIRED_EVENT, sync);
    return () => {
      window.removeEventListener(HUB_AUTH_CHANGED_EVENT, sync);
      window.removeEventListener(HUB_AUTH_REQUIRED_EVENT, sync);
    };
  }, []);
  return owner;
}
