import { useEffect, useState, type FormEvent } from 'react';
import {
  assertApiNotPageOrigin,
  clearHubApiConfig,
  getHubApiConfig,
  setHubApiConfig,
} from '../api/hub-api';
import {
  HUB_AUTH_REQUIRED_EVENT,
  clearHubAuthSession,
  getAccessToken,
  getHubAuthSession,
  setHubAuthSession,
} from '../lib/hub-auth-session';

function normalizeUrl(raw: string): string {
  return raw.trim().replace(/\/$/, '');
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

export function HubApiSettingsPage() {
  const initial = getHubApiConfig();
  const [url, setUrl] = useState(initial.url);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [signingIn, setSigningIn] = useState(false);
  const [sessionLabel, setSessionLabel] = useState(() => getHubAuthSession()?.username || '');

  const configured = !!(normalizeUrl(url) && sessionLabel);

  function refreshStatusMessage(cfg = getHubApiConfig()) {
    const session = getHubAuthSession();
    setSessionLabel(session?.username || '');
    if (session && cfg.url) {
      setStatus(`Signed in as ${session.username || 'user'} — API mode on (${cfg.url}).`);
    } else if (cfg.url && !session) {
      setStatus('API URL saved — sign in to enable API mode.');
    } else if (session && !cfg.url) {
      setStatus('Signed in — save an API base URL to enable API mode.');
    } else {
      setStatus('Not configured — apps use localStorage only.');
    }
  }

  useEffect(() => {
    const onAuthRequired = () => {
      setError('Session expired — sign in again.');
      refreshStatusMessage();
    };
    window.addEventListener(HUB_AUTH_REQUIRED_EVENT, onAuthRequired);
    return () => window.removeEventListener(HUB_AUTH_REQUIRED_EVENT, onAuthRequired);
  }, []);

  function handleSave(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const nextUrl = normalizeUrl(url);
      if (nextUrl) {
        assertApiNotPageOrigin(nextUrl);
      }
      const cfg = setHubApiConfig({ url: nextUrl });
      setUrl(cfg.url);
      refreshStatusMessage(cfg);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  function handleClear() {
    setError(null);
    clearHubApiConfig();
    clearHubAuthSession();
    setUrl('');
    setUsername('');
    setPassword('');
    setSessionLabel('');
    setStatus('Cleared — apps use localStorage only.');
  }

  async function handleSignIn(event: FormEvent) {
    event.preventDefault();
    setSigningIn(true);
    setError(null);
    try {
      const nextUrl = normalizeUrl(url);
      if (!nextUrl) {
        throw new Error('Enter an API base URL first.');
      }
      assertApiNotPageOrigin(nextUrl);
      setHubApiConfig({ url: nextUrl });
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
    const nextUrl = normalizeUrl(url);
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
    const nextUrl = normalizeUrl(url);
    const token = getAccessToken();
    try {
      if (!nextUrl) {
        throw new Error('Enter an API base URL first.');
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
      setStatus('Connection OK — health and session look good. Save to keep the URL.');
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
        Optional sync backend. Set the API URL and sign in as Rayenz (local SAM uses the live
        Cognito pool). Default: <code>http://127.0.0.1:3000</code>. Do not set the URL to this
        page&apos;s origin.
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
      {!configured && !status && (
        <div className="hub-web-banner hub-web-banner--warn" role="status">
          Hub API is not configured — apps save to localStorage only.
        </div>
      )}

      <form className="hub-web-form" onSubmit={handleSave}>
        <fieldset>
          <legend>Connection</legend>
          <label className="hub-web-field">
            API base URL
            <input
              type="url"
              name="hub-api-url"
              autoComplete="off"
              spellCheck={false}
              placeholder="http://127.0.0.1:3000"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
          </label>
        </fieldset>

        <div className="hub-web-form-actions">
          <button type="submit" className="hub-web-button" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            className="hub-web-button hub-web-button--secondary"
            disabled={testing}
            onClick={() => void handleTest()}
          >
            {testing ? 'Testing…' : 'Test connection'}
          </button>
          <button type="button" className="hub-web-button hub-web-button--secondary" onClick={handleClear}>
            Clear
          </button>
        </div>
      </form>

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
        </div>
      </form>
    </div>
  );
}
