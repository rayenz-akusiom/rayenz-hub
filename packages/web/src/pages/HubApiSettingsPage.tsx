import { useEffect, useState } from 'react';
import { assertApiNotPageOrigin, getHubApiConfig } from '../api/hub-api';
import {
  HUB_AUTH_CHANGED_EVENT,
  HUB_AUTH_REQUIRED_EVENT,
  getAccessToken,
  getHubAuthSession,
} from '../lib/hub-auth-session';

function statusFromConfig(): string {
  const cfg = getHubApiConfig();
  const session = getHubAuthSession();
  if (session && cfg.url) {
    return `Signed in as ${session.username || 'user'} — API mode on (${cfg.url}).`;
  }
  if (cfg.url && !session) {
    return 'Sign in from the nav to enable API mode.';
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
  const url = getHubApiConfig().url;

  function refreshStatusMessage() {
    setStatus(statusFromConfig());
  }

  useEffect(() => {
    refreshStatusMessage();
    const onAuthChanged = () => {
      refreshStatusMessage();
    };
    const onAuthRequired = () => {
      setError('Session expired — sign in again.');
      refreshStatusMessage();
    };
    window.addEventListener(HUB_AUTH_CHANGED_EVENT, onAuthChanged);
    window.addEventListener(HUB_AUTH_REQUIRED_EVENT, onAuthRequired);
    return () => {
      window.removeEventListener(HUB_AUTH_CHANGED_EVENT, onAuthChanged);
      window.removeEventListener(HUB_AUTH_REQUIRED_EVENT, onAuthRequired);
    };
  }, []);

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
        Optional sync backend. Sign in as Rayenz from the left nav (local SAM uses the live Cognito pool).
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

      <div className="hub-web-form-actions">
        <button
          type="button"
          className="hub-web-button hub-web-button--secondary"
          disabled={testing}
          onClick={() => void handleTest()}
        >
          {testing ? 'Testing…' : 'Test connection'}
        </button>
      </div>
    </div>
  );
}
