import { normalizeUsername } from '@rayenz-hub/shared';
import { assertApiNotPageOrigin, getHubApiConfig } from '../api/hub-api-client';
import { clearHubAuthSession, getHubAuthSession, setHubAuthSession } from './hub-auth-session';

export async function hydrateHubOwnerFlag(options: { force?: boolean } = {}): Promise<void> {
  const session = getHubAuthSession();
  const url = getHubApiConfig().url;
  if (!session || !url) return;
  if (!options.force && session.isOwner !== undefined) return;
  try {
    assertApiNotPageOrigin(url);
    const res = await fetch(`${url.replace(/\/$/, '')}/v1/auth/me`, {
      headers: { Authorization: `Bearer ${session.accessToken}`, Accept: 'application/json' },
    });
    if (!res.ok) return;
    const body = JSON.parse(await res.text()) as { isOwner?: unknown };
    if (typeof body.isOwner !== 'boolean') return;
    const latest = getHubAuthSession();
    if (!latest) return;
    setHubAuthSession({ ...latest, isOwner: body.isOwner });
  } catch {
    /* fail closed — expensive UI stays hidden */
  }
}

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
    body: JSON.stringify({ username: normalizeUsername(username), password }),
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
    username: body.username || normalizeUsername(username),
    sub: body.sub,
  });
  await hydrateHubOwnerFlag({ force: true });
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
