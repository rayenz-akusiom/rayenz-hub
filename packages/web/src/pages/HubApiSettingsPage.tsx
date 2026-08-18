import { useEffect, useState, type FormEvent } from 'react';
import { assertApiNotPageOrigin, getHubApiConfig } from '../api/hub-api';
import { changePassword, hydrateHubOwnerFlag } from '../lib/hub-auth-client';
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
  return 'Not configured — this build has no Hub API URL.';
}

function canChangePassword(): boolean {
  return Boolean(getHubAuthSession() && getHubApiConfig().url);
}

export function HubApiSettingsPage() {
  const [status, setStatus] = useState<string | null>(() => statusFromConfig());
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(canChangePassword);
  const [previousPassword, setPreviousPassword] = useState('');
  const [proposedPassword, setProposedPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordStatus, setPasswordStatus] = useState<string | null>(null);
  const url = getHubApiConfig().url;

  function refreshStatusMessage() {
    setStatus(statusFromConfig());
    setShowPasswordForm(canChangePassword());
  }

  useEffect(() => {
    refreshStatusMessage();
    const onAuthChanged = () => {
      refreshStatusMessage();
    };
    const onAuthRequired = () => {
      setError('Session expired — sign in again.');
      setPasswordStatus(null);
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
      await hydrateHubOwnerFlag({ force: true });
      setStatus('Connection OK — health and session look good.');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setTesting(false);
    }
  }

  async function handleChangePassword(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setPasswordStatus(null);
    if (proposedPassword !== confirmPassword) {
      setError('New passwords do not match.');
      return;
    }
    setChangingPassword(true);
    try {
      await changePassword(previousPassword, proposedPassword);
      setPreviousPassword('');
      setProposedPassword('');
      setConfirmPassword('');
      setPasswordStatus('Password updated.');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setChangingPassword(false);
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

      {showPasswordForm && (
        <form className="hub-web-form" onSubmit={(e) => void handleChangePassword(e)}>
          <fieldset>
            <legend>Change password</legend>
            <p className="hub-web-hint">At least 8 characters, with uppercase, lowercase, and a number.</p>
            {passwordStatus && (
              <div className="hub-web-banner hub-web-banner--ok" role="status">
                {passwordStatus}
              </div>
            )}
            <label className="hub-web-field">
              Current password
              <input
                type="password"
                autoComplete="current-password"
                value={previousPassword}
                onChange={(e) => setPreviousPassword(e.target.value)}
              />
            </label>
            <label className="hub-web-field">
              New password
              <input
                type="password"
                autoComplete="new-password"
                value={proposedPassword}
                onChange={(e) => setProposedPassword(e.target.value)}
              />
            </label>
            <label className="hub-web-field">
              Confirm new password
              <input
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </label>
            <button
              type="submit"
              className="hub-web-button"
              disabled={
                changingPassword || !previousPassword || !proposedPassword || !confirmPassword
              }
            >
              {changingPassword ? 'Updating…' : 'Update password'}
            </button>
          </fieldset>
        </form>
      )}
    </div>
  );
}
