import { useEffect, useState, type FormEvent } from 'react';
import { assertApiNotPageOrigin, getHubApiConfig } from '../api/hub-api';
import {
  HUB_AUTH_REQUIRED_EVENT,
  clearHubAuthSession,
  getAccessToken,
  getHubAuthSession,
  setHubAuthSession,
} from '../lib/hub-auth-session';

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

function statusFromConfig(): string {
  const cfg = getHubApiConfig();
  const session = getHubAuthSession();
  if (session && cfg.url) {
    return `Signed in as ${session.username || 'user'} — API mode on (${cfg.url}).`;
  }
  if (cfg.url && !session) {
    return 'Sign in to enable API mode.';
  }
  if (session && !cfg.url) {
    return 'Signed in — this build has no Hub API URL.';
  }
  return 'Not configured — apps use localStorage only.';
}

export function HubApiSettingsPage() {
  const [status, setStatus] = useState<string | null>(() => statusFromConfig());
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [signingIn, setSigningIn] = useState(false);
  const [sessionLabel, setSessionLabel] = useState(() => getHubAuthSession()?.username || '');
  const url = getHubApiConfig().url;

  function refreshStatusMessage() {
    setSessionLabel(getHubAuthSession()?.username || '');
    setStatus(statusFromConfig());
  }

  useEffect(() => {
    refreshStatusMessage();
    const onAuthRequired = () => {
      setError('Session expired — sign in again.');
      refreshStatusMessage();
    };
    window.addEventListener(HUB_AUTH_REQUIRED_EVENT, onAuthRequired);
    return () => window.removeEventListener(HUB_AUTH_REQUIRED_EVENT, onAuthRequired);
  }, []);

  async function handleSignIn(event: FormEvent) {
    event.preventDefault();
    setSigningIn(true);
    setError(null);
    try {
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
      setPassword('');
      refreshStatusMessage();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSigningIn(false);
    }
  }

  function handleSignOut() {
    const nextUrl = getHubApiConfig().url;
    const session = getHubAuthSession();
    if (nextUrl && session?.accessToken) {
      void fetch(`${nextUrl}/v1/auth/sign-out`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.accessToken}` },
      });
    }
    clearHubAuthSession();
    setSessionLabel('');
    setStatus('Signed out.');
  }

  async function handleTest() {
    setTesting(true);
    setError(null);
    setStatus(null);
    const nextUrl = getHubApiConfig().url;
    const token = getAccessToken();
    try {
      if (!nextUrl) {
        throw new Error('This build has no Hub API URL.');
      }
      assertApiNotPageOrigin(nextUrl);
      const healthRes = await fetch(`${nextUrl}/v1/health`);
      if (!healthRes.ok) {
        throw new Error(`Health check failed (${healthRes.status}).`);
      }
      if (!token) {
        setStatus('Health OK — sign in to enable API mode.');
        return;
      }
      const authRes = await fetch(`${nextUrl}/v1/auth/me`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      });
      if (authRes.status === 401) {
        throw new Error('Unauthorized — sign in again.');
      }
      if (!authRes.ok && authRes.status !== 404) {
        throw new Error(`API check failed (${authRes.status}).`);
      }
      setStatus('Connection OK — health and session look good.');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="hub-web-page hub-web-page--tab">
      <h2 className="hub-web-section-title">Hub API</h2>
      <p className="hub-web-hint">
        Optional sync backend. Sign in as Rayenz (local SAM uses the live Cognito pool).
        {url ? (
          <>
            {' '}
            API: <code>{url}</code>.
          </>
        ) : (
          <> This build has no API URL.</>
        )}{' '}
        Do not point the API at this page&apos;s origin.
      </p>

      {error && (
        <div className="hub-web-banner hub-web-banner--error" role="alert">
          {error}
        </div>
      )}
      {status && (
        <div className="hub-web-banner hub-web-banner--ok" role="status">
          {status}
        </div>
      )}

      <form className="hub-web-form" onSubmit={(e) => void handleSignIn(e)}>
        <fieldset>
          <legend>Sign in</legend>
          {sessionLabel ? (
            <p className="hub-web-hint">
              Signed in as <strong>{sessionLabel}</strong>.
            </p>
          ) : (
            <p className="hub-web-hint">Required for API mode. Client-only mode needs no login.</p>
          )}
          <label className="hub-web-field">
            Username
            <input
              type="text"
              name="hub-username"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </label>
          <label className="hub-web-field">
            Password
            <input
              type="password"
              name="hub-password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
        </fieldset>
        <div className="hub-web-form-actions">
          <button type="submit" className="hub-web-button" disabled={signingIn || !username.trim() || !password}>
            {signingIn ? 'Signing in…' : 'Sign in'}
          </button>
          <button type="button" className="hub-web-button hub-web-button--secondary" onClick={handleSignOut}>
            Sign out
          </button>
          <button
            type="button"
            className="hub-web-button hub-web-button--secondary"
            disabled={testing}
            onClick={() => void handleTest()}
          >
            {testing ? 'Testing…' : 'Test connection'}
          </button>
        </div>
      </form>
    </div>
  );
}
