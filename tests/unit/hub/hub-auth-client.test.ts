import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  signInErrorFromResponse,
  signInWithPassword,
  signOutHubSession,
} from '../../../packages/web/src/lib/hub-auth-client.ts';
import { clearHubAuthSession, getHubAuthSession, isHubOwner, setHubAuthSession } from '../../../packages/web/src/lib/hub-auth-session.ts';

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  clearHubAuthSession();
  vi.unstubAllGlobals();
});

describe('hub-auth-client', () => {
  it('uses the API error string when present', () => {
    expect(signInErrorFromResponse(400, JSON.stringify({ error: 'Nope' })).message).toBe('Nope');
  });

  it('falls back when error is not a string', () => {
    expect(signInErrorFromResponse(401, JSON.stringify({ error: 12 })).message).toBe('Sign-in failed (401).');
  });

  it('falls back when error is blank', () => {
    expect(signInErrorFromResponse(401, JSON.stringify({ error: '  ' })).message).toBe('Sign-in failed (401).');
  });

  it('signs in and stores the session with owner flag from /v1/auth/me', async () => {
    localStorage.setItem('rayenz-hub-api-url', 'http://127.0.0.1:3000');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/v1/auth/me')) {
          return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify({ username: 'Rayenz', sub: 'sub-1', isOwner: true }),
          };
        }
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              accessToken: 'access',
              idToken: 'id',
              refreshToken: 'refresh',
              username: 'Rayenz',
              sub: 'sub-1',
            }),
        };
      }),
    );
    await signInWithPassword('Rayenz', 'secret');
    expect(getHubAuthSession()).toMatchObject({
      accessToken: 'access',
      username: 'Rayenz',
      sub: 'sub-1',
      isOwner: true,
    });
  });

  it('uses the submitted username when the body omits it', async () => {
    localStorage.setItem('rayenz-hub-api-url', 'http://127.0.0.1:3000');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ accessToken: 'access' }),
      })),
    );
    await signInWithPassword('  Rayenz  ', 'secret');
    expect(getHubAuthSession()?.username).toBe('rayenz');
  });

  it('does not call sign-out when there is no session', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    signOutHubSession();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getHubAuthSession()).toBeNull();
  });

  it('treats a missing owner flag as not owner', () => {
    expect(isHubOwner()).toBe(false);
    setHubAuthSession({ accessToken: 't', username: 'friend', isOwner: false });
    expect(isHubOwner()).toBe(false);
    setHubAuthSession({ accessToken: 't', username: 'Rayenz', isOwner: true });
    expect(isHubOwner()).toBe(true);
  });
});
