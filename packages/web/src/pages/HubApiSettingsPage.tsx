import { useState, type FormEvent } from 'react';
import {
  assertApiNotPageOrigin,
  clearHubApiConfig,
  getHubApiConfig,
  setHubApiConfig,
} from '../api/hub-api';

function normalizeUrl(raw: string): string {
  return raw.trim().replace(/\/$/, '');
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

  const configured = !!(normalizeUrl(url) && key.trim());

  function refreshStatusMessage(cfg = getHubApiConfig()) {
    if (cfg.enabled) {
      setStatus(`Configured — API mode on (${cfg.url}).`);
    } else if (cfg.url || cfg.key) {
      setStatus('Partial — both URL and key are required for API mode.');
    } else {
      setStatus('Not configured — apps use localStorage only.');
    }
  }

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
    setUrl('');
    setKey('');
    setStatus('Cleared — apps use localStorage only.');
  }

  async function handleTest() {
    setTesting(true);
    setError(null);
    setStatus(null);
    const nextUrl = normalizeUrl(url);
    const nextKey = key.trim();
    try {
      if (!nextUrl) {
        throw new Error('Enter an API base URL first.');
      }
      assertApiNotPageOrigin(nextUrl);
      const healthRes = await fetch(`${nextUrl}/v1/health`);
      if (!healthRes.ok) {
        throw new Error(`Health check failed (${healthRes.status}).`);
      }
      if (!nextKey) {
        setStatus('Health OK — add an API key and Save to enable API mode.');
        return;
      }
      const authRes = await fetch(`${nextUrl}/v1/settings/dailies`, {
        headers: { Authorization: `Bearer ${nextKey}`, Accept: 'application/json' },
      });
      if (authRes.status === 401) {
        throw new Error('Unauthorized — check the API key.');
      }
      if (!authRes.ok && authRes.status !== 404) {
        throw new Error(`API check failed (${authRes.status}).`);
      }
      setStatus('Connection OK — health and API key look good. Save to keep these values.');
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
        Optional sync backend. Stored only in this browser&apos;s localStorage (not uploaded). Local
        default: <code>http://127.0.0.1:3000</code>. On a phone/iPad use your PC LAN IP, e.g.{' '}
        <code>http://192.168.x.x:3000</code>. Do not set the URL to this page&apos;s origin.
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
            <span className="hub-web-field-label">API key</span>
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
    </div>
  );
}
