import { assertApiNotPageOrigin, getHubApiConfig } from '../api/hub-api-client';
import { clearHubAuthSession, getHubAuthSession, setHubAuthSession } from './hub-auth-session';

export function signInErrorFromResponse(status: number, text: string): Error {
  try {
    const body = JSON.parse(text) as { error?: unknown };
    if (typeof body.error === 'string' && body.error.trim()) {
      return new Error(body.error);
    }
  } catch {
    /* ignore non-JSON */
  }
  return new Error(`Sign-in failed (${status}).`);
}

export async function signInWithPassword(username: string, password: string): Promise<void> {
  const nextUrl = getHubApiConfig().url;
  if (!nextUrl) {
    throw new Error('This build has no Hub API URL.');
  }
  assertApiNotPageOrigin(nextUrl);
  const res = await fetch(`${nextUrl}/v1/auth/sign-in`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ username: username.trim(), password }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw signInErrorFromResponse(res.status, text);
  }
  const body = JSON.parse(text) as {
    accessToken: string;
    idToken?: string;
    refreshToken?: string;
    username?: string;
    sub?: string;
  };
  setHubAuthSession({
    accessToken: body.accessToken,
    idToken: body.idToken,
    refreshToken: body.refreshToken,
    username: body.username || username.trim(),
    sub: body.sub,
  });
}

export function signOutHubSession(): void {
  const nextUrl = getHubApiConfig().url;
  const session = getHubAuthSession();
  if (nextUrl && session?.accessToken) {
    void fetch(`${nextUrl}/v1/auth/sign-out`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${session.accessToken}` },
    });
  }
  clearHubAuthSession();
}
