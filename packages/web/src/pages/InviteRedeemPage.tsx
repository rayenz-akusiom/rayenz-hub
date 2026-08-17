import { useMemo, useState, type FormEvent } from 'react';
import { getHubApiConfig, setHubApiConfig } from '../api/hub-api-client';
import { setHubAuthSession } from '../lib/hub-auth-session';

function tokenFromHash(): string {
  const hash = typeof window !== 'undefined' ? window.location.hash : '';
  const match = hash.match(/#\/invite\/([^/?]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

export function InviteRedeemPage() {
  const token = useMemo(() => tokenFromHash(), []);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (!token) {
        throw new Error('You need an invite to create an account.');
      }
      const cfg = getHubApiConfig();
      if (!cfg.url) {
        throw new Error('Set the Hub API URL in Settings first.');
      }
      const res = await fetch(`${cfg.url}/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ token, username: username.trim(), password }),
      });
      const text = await res.text();
      if (!res.ok) {
        throw new Error('Registration failed.');
      }
      const body = JSON.parse(text) as {
        accessToken: string;
        idToken?: string;
        refreshToken?: string;
        username?: string;
        sub?: string;
      };
      setHubApiConfig({ url: cfg.url, key: cfg.key });
      setHubAuthSession({
        accessToken: body.accessToken,
        idToken: body.idToken,
        refreshToken: body.refreshToken,
        username: body.username || username.trim(),
        sub: body.sub,
      });
      setStatus('Account created. You are signed in to an empty Hub.');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <div className="hub-web-page">
        <h2>Sign up</h2>
        <p className="hub-web-hint">You need an invite to create an account.</p>
      </div>
    );
  }

  return (
    <div className="hub-web-page">
      <h2>Complete invite</h2>
      <p className="hub-web-hint">Choose a username and password. This account starts empty.</p>
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
      <form className="hub-web-form" onSubmit={(e) => void handleSubmit(e)}>
        <label className="hub-web-field">
          Username
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
        </label>
        <label className="hub-web-field">
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
        </label>
        <button type="submit" className="hub-web-button" disabled={busy || !username.trim() || password.length < 8}>
          {busy ? 'Creating…' : 'Create account'}
        </button>
      </form>
    </div>
  );
}
