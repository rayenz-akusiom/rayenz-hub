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
  const [key, setKey] = useState(initial.key);
  const [showKey, setShowKey] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [signingIn, setSigningIn] = useState(false);
  const [sessionLabel, setSessionLabel] = useState(() => getHubAuthSession()?.username || '');

  const configured = !!(normalizeUrl(url) && (key.trim() || sessionLabel));

  function refreshStatusMessage(cfg = getHubApiConfig()) {
    const session = getHubAuthSession();
    setSessionLabel(session?.username || '');
    if (session && cfg.url) {
      setStatus(`Signed in as ${session.username || 'user'} — API mode on (${cfg.url}).`);
    } else if (cfg.enabled) {
      setStatus(`Configured — API mode on (${cfg.url}).`);
    } else if (cfg.url && !session && !cfg.key) {
      setStatus('API URL saved — sign in as Rayenz, or add a local operator key for MCP/curl.');
    } else if (cfg.url || cfg.key) {
      setStatus('Partial — URL plus sign-in (or a local operator key) is required for API mode.');
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
      const cfg = setHubApiConfig({ url: nextUrl, key: key.trim() });
      setUrl(cfg.url);
      setKey(cfg.key);
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
    setKey('');
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
      setHubApiConfig({ url: nextUrl, key: key.trim() });
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
    const nextKey = key.trim();
    const token = getHubAuthSession()?.accessToken || nextKey;
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
        setStatus('Health OK — sign in as Rayenz (or add a local operator key) and Save to enable API mode.');
        return;
      }
      const authRes = await fetch(`${nextUrl}/v1/auth/me`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      });
      if (authRes.status === 401) {
        throw new Error('Unauthorized — sign in again or check the local operator key.');
      }
      if (!authRes.ok && authRes.status !== 404) {
        throw new Error(`API check failed (${authRes.status}).`);
      }
      setStatus('Connection OK — health and credentials look good. Save to keep the URL.');
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
        Optional sync backend. Sign in as Rayenz (local SAM uses the live Cognito pool). The
        operator key is for MCP/curl, not the browser session. Default:{' '}
        <code>http://127.0.0.1:3000</code>. Do not set the URL to this page&apos;s origin.
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
          <div className="hub-web-field">
            <span className="hub-web-field-label">Local operator key (optional)</span>
            <div className="hub-web-secret-row">
              <input
                id="hub-api-key"
                type={showKey ? 'text' : 'password'}
                name="hub-api-key"
                autoComplete="off"
                placeholder="test-api-key-local"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                aria-label="API key"
              />
              <button
                type="button"
                className="hub-web-button hub-web-button--secondary hub-web-secret-toggle"
                onClick={() => setShowKey((v) => !v)}
                aria-pressed={showKey}
              >
                {showKey ? 'Hide key' : 'Show key'}
              </button>
            </div>
          </div>
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
