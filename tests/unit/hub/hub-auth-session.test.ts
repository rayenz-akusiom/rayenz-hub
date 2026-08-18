import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearHubAuthSession,
  getAccessToken,
  getHubAuthSession,
  isSignedIn,
  notifyAuthRequired,
  readJwtExp,
  restoreHubAuthSession,
  setHubAuthSession,
  shouldRefreshAccessToken,
  tryRefreshAccessToken,
} from '../../../packages/web/src/lib/hub-auth-session.ts';
import { jsonResponse } from '../helpers/hubHarness.ts';

function jwtWithExp(exp: number): string {
  const header = btoa(JSON.stringify({ alg: 'none', typ: 'JWT' }));
  const payload = btoa(JSON.stringify({ exp }));
  return `${header}.${payload}.sig`;
}

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  clearHubAuthSession();
  vi.unstubAllGlobals();
});

describe('hub auth session storage', () => {
  it('persists tokens in localStorage, not sessionStorage', () => {
    setHubAuthSession({
      accessToken: 'access',
      idToken: 'id',
      refreshToken: 'refresh',
      username: 'Rayenz',
      sub: 'sub-1',
      isOwner: true,
    });
    expect(localStorage.getItem('rayenz-hub-access-token')).toBe('access');
    expect(localStorage.getItem('rayenz-hub-refresh-token')).toBe('refresh');
    expect(localStorage.getItem('rayenz-hub-username')).toBe('Rayenz');
    expect(localStorage.getItem('rayenz-hub-sub')).toBe('sub-1');
    expect(localStorage.getItem('rayenz-hub-is-owner')).toBe('1');
    expect(sessionStorage.getItem('rayenz-hub-access-token')).toBe(null);
    expect(getHubAuthSession()).toMatchObject({
      accessToken: 'access',
      refreshToken: 'refresh',
      username: 'Rayenz',
      isOwner: true,
    });
  });

  it('migrates a legacy sessionStorage session into localStorage', () => {
    sessionStorage.setItem('rayenz-hub-access-token', 'legacy-access');
    sessionStorage.setItem('rayenz-hub-refresh-token', 'legacy-refresh');
    sessionStorage.setItem('rayenz-hub-username', 'Rayenz');
    const session = getHubAuthSession();
    expect(session).toMatchObject({
      accessToken: 'legacy-access',
      refreshToken: 'legacy-refresh',
      username: 'Rayenz',
    });
    expect(localStorage.getItem('rayenz-hub-access-token')).toBe('legacy-access');
    expect(sessionStorage.getItem('rayenz-hub-access-token')).toBe(null);
  });

  it('treats a refresh-only store as a signed-in session', () => {
    localStorage.setItem('rayenz-hub-refresh-token', 'refresh-only');
    localStorage.setItem('rayenz-hub-username', 'Rayenz');
    expect(getAccessToken()).toBe('');
    expect(isSignedIn()).toBe(true);
    expect(getHubAuthSession()).toMatchObject({
      accessToken: '',
      refreshToken: 'refresh-only',
      username: 'Rayenz',
    });
  });

  it('clears every auth key from both storages on sign-out', () => {
    setHubAuthSession({
      accessToken: 'access',
      refreshToken: 'refresh',
      username: 'Rayenz',
      sub: 'sub-1',
      isOwner: true,
    });
    sessionStorage.setItem('rayenz-hub-access-token', 'stale');
    clearHubAuthSession();
    expect(getHubAuthSession()).toBeNull();
    expect(isSignedIn()).toBe(false);
    expect(localStorage.getItem('rayenz-hub-access-token')).toBe(null);
    expect(localStorage.getItem('rayenz-hub-refresh-token')).toBe(null);
    expect(localStorage.getItem('rayenz-hub-username')).toBe(null);
    expect(localStorage.getItem('rayenz-hub-sub')).toBe(null);
    expect(localStorage.getItem('rayenz-hub-is-owner')).toBe(null);
    expect(sessionStorage.getItem('rayenz-hub-access-token')).toBe(null);
  });
});

describe('access token expiry', () => {
  it('reads JWT exp and treats missing or opaque tokens as not expiring', () => {
    const exp = 1_700_000_000;
    expect(readJwtExp(jwtWithExp(exp))).toBe(exp);
    expect(readJwtExp('not-a-jwt')).toBe(null);
    expect(shouldRefreshAccessToken('opaque-test-token')).toBe(false);
    expect(shouldRefreshAccessToken('')).toBe(true);
  });

  it('refreshes when exp is past or within the skew window', () => {
    const now = 1_800_000_000;
    expect(shouldRefreshAccessToken(jwtWithExp(now - 10), now)).toBe(true);
    expect(shouldRefreshAccessToken(jwtWithExp(now + 30), now)).toBe(true);
    expect(shouldRefreshAccessToken(jwtWithExp(now + 3600), now)).toBe(false);
  });
});

describe('tryRefreshAccessToken and restore', () => {
  it('returns invalid without calling fetch when no refresh token is stored', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    setHubAuthSession({ accessToken: 'access' });
    await expect(tryRefreshAccessToken('http://127.0.0.1:3000')).resolves.toEqual({
      ok: false,
      cause: 'invalid',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('stores the new access token on success', async () => {
    setHubAuthSession({
      accessToken: 'old',
      refreshToken: 'refresh-me',
      username: 'Rayenz',
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse({
          accessToken: 'new-access',
          refreshToken: 'refresh-me',
          username: 'Rayenz',
        }),
      ),
    );
    await expect(tryRefreshAccessToken('http://127.0.0.1:3000')).resolves.toEqual({
      ok: true,
      accessToken: 'new-access',
    });
    expect(getAccessToken()).toBe('new-access');
    expect(localStorage.getItem('rayenz-hub-access-token')).toBe('new-access');
  });

  it('marks refresh 401 as invalid and restore wipes the session', async () => {
    setHubAuthSession({
      accessToken: jwtWithExp(1),
      refreshToken: 'stale-refresh',
      username: 'Rayenz',
    });
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse('denied', { status: 401, ok: false })));
    const required = vi.fn();
    window.addEventListener('hub-auth-required', required);
    await restoreHubAuthSession('http://127.0.0.1:3000');
    expect(getHubAuthSession()).toBeNull();
    expect(required).toHaveBeenCalled();
    window.removeEventListener('hub-auth-required', required);
  });

  it('does not wipe the session when refresh is unavailable', async () => {
    setHubAuthSession({
      accessToken: jwtWithExp(1),
      refreshToken: 'refresh-me',
      username: 'Rayenz',
    });
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse('down', { status: 503, ok: false })));
    await restoreHubAuthSession('http://127.0.0.1:3000');
    expect(getHubAuthSession()?.refreshToken).toBe('refresh-me');
    expect(isSignedIn()).toBe(true);
  });

  it('does not wipe the session when refresh fetch throws', async () => {
    setHubAuthSession({
      accessToken: jwtWithExp(1),
      refreshToken: 'refresh-me',
      username: 'Rayenz',
    });
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('network');
    }));
    await restoreHubAuthSession('http://127.0.0.1:3000');
    expect(getHubAuthSession()?.refreshToken).toBe('refresh-me');
  });

  it('skips refresh when the access JWT is still valid', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    setHubAuthSession({
      accessToken: jwtWithExp(Date.now() / 1000 + 3600),
      refreshToken: 'refresh-me',
      username: 'Rayenz',
    });
    await restoreHubAuthSession('http://127.0.0.1:3000');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('notifyAuthRequired', () => {
  it('clears the persisted session', () => {
    setHubAuthSession({ accessToken: 'access', refreshToken: 'refresh' });
    notifyAuthRequired();
    expect(getHubAuthSession()).toBeNull();
    expect(localStorage.getItem('rayenz-hub-refresh-token')).toBe(null);
  });
});
