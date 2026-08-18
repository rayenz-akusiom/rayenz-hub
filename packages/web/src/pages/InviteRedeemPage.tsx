import { useMemo, useState, type FormEvent } from 'react';
import { getHubApiConfig } from '../api/hub-api-client';
import { setHubAuthSession } from '../lib/hub-auth-session';

function tokenFromHash(): string {
  const hash = typeof window !== 'undefined' ? window.location.hash : '';
  const match = hash.match(/#\/invite\/([^/?]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function InviteRedeemPage() {
  const token = useMemo(() => tokenFromHash(), []);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [pendingConfirm, setPendingConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleRegister(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (!token) {
        throw new Error('You need an invite to create an account.');
      }
      const cfg = getHubApiConfig();
      if (!cfg.url) {
        throw new Error('This build has no Hub API URL.');
      }
      const res = await fetch(`${cfg.url}/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          token,
          username: username.trim(),
          email: email.trim(),
          password,
        }),
      });
      const text = await res.text();
      if (!res.ok) {
        throw new Error('Registration failed.');
      }
      const body = JSON.parse(text) as { status?: string; username?: string };
      if (body.status !== 'CONFIRM_EMAIL') {
        throw new Error('Registration failed.');
      }
      setPendingConfirm(true);
      setStatus('Check your email for a confirmation code.');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirm(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const cfg = getHubApiConfig();
      if (!cfg.url) {
        throw new Error('This build has no Hub API URL.');
      }
      const res = await fetch(`${cfg.url}/v1/auth/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ username: username.trim(), code: code.trim(), password }),
      });
      const text = await res.text();
      if (!res.ok) {
        throw new Error('Confirmation failed.');
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
      setStatus('Account created. You are signed in to an empty Hub.');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleResend() {
    setBusy(true);
    setError(null);
    try {
      const cfg = getHubApiConfig();
      if (!cfg.url) {
        throw new Error('This build has no Hub API URL.');
      }
      const res = await fetch(`${cfg.url}/v1/auth/resend-confirmation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ username: username.trim() }),
      });
      if (!res.ok) {
        throw new Error('Could not resend the confirmation code.');
      }
      setStatus('A new confirmation code was sent.');
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
      <p className="hub-web-hint">
        {pendingConfirm
          ? 'Enter the code Cognito emailed you, then you can sign in with your username and password.'
          : 'Choose a username, email, and password. Cognito will email a verification code. This account starts empty.'}
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
      {pendingConfirm ? (
        <form className="hub-web-form" onSubmit={(e) => void handleConfirm(e)}>
          <label className="hub-web-field">
            Confirmation code
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoComplete="one-time-code"
              inputMode="numeric"
            />
          </label>
          <button type="submit" className="hub-web-button" disabled={busy || code.trim().length < 6}>
            {busy ? 'Confirming…' : 'Confirm email'}
          </button>
          <button type="button" className="hub-web-button hub-web-button--secondary" disabled={busy} onClick={() => void handleResend()}>
            Resend code
          </button>
        </form>
      ) : (
        <form className="hub-web-form" onSubmit={(e) => void handleRegister(e)}>
          <label className="hub-web-field">
            Username
            <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
          </label>
          <label className="hub-web-field">
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
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
          <button
            type="submit"
            className="hub-web-button"
            disabled={busy || !username.trim() || !looksLikeEmail(email.trim()) || password.length < 8}
          >
            {busy ? 'Creating…' : 'Create account'}
          </button>
        </form>
      )}
    </div>
  );
}
