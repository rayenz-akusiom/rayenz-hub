const ACCESS_KEY = 'rayenz-hub-access-token';
const ID_KEY = 'rayenz-hub-id-token';
const REFRESH_KEY = 'rayenz-hub-refresh-token';
const USERNAME_KEY = 'rayenz-hub-username';
const SUB_KEY = 'rayenz-hub-sub';

export const HUB_AUTH_REQUIRED_EVENT = 'hub-auth-required';

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
}

export function notifyAuthRequired(): void {
  clearHubAuthSession();
  try {
    window.dispatchEvent(new CustomEvent(HUB_AUTH_REQUIRED_EVENT));
  } catch {
    /* ignore */
  }
}

export class HubAuthRequiredError extends Error {
  constructor(message = 'Hub API sign-in required') {
    super(message);
    this.name = 'HubAuthRequiredError';
  }
}
