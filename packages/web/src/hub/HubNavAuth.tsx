import { normalizeUsername } from '@rayenz-hub/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { signInWithPassword, signOutHubSession } from '../lib/hub-auth-client';
import {
  HUB_AUTH_CHANGED_EVENT,
  HUB_AUTH_REQUIRED_EVENT,
  getHubAuthSession,
} from '../lib/hub-auth-session';

function sessionUsername(): string | null {
  const session = getHubAuthSession();
  if (!session) return null;
  return session.username || 'user';
}

export function HubNavAuth() {
  const [usernameLabel, setUsernameLabel] = useState(() => sessionUsername());
  const [formOpen, setFormOpen] = useState(false);
  const [signOutOpen, setSignOutOpen] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const syncSession = () => {
      const next = sessionUsername();
      setUsernameLabel(next);
      if (next) {
        setFormOpen(false);
        setPassword('');
      } else {
        setSignOutOpen(false);
      }
    };
    const onAuthRequired = () => {
      setError('Session expired — sign in again.');
      syncSession();
    };
    window.addEventListener(HUB_AUTH_CHANGED_EVENT, syncSession);
    window.addEventListener(HUB_AUTH_REQUIRED_EVENT, onAuthRequired);
    return () => {
      window.removeEventListener(HUB_AUTH_CHANGED_EVENT, syncSession);
      window.removeEventListener(HUB_AUTH_REQUIRED_EVENT, onAuthRequired);
    };
  }, []);

  async function handleSignIn(event: FormEvent) {
    event.preventDefault();
    setSigningIn(true);
    setError(null);
    try {
      await signInWithPassword(username, password);
      setPassword('');
      setFormOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSigningIn(false);
    }
  }

  function handleSignOut() {
    signOutHubSession();
    setSignOutOpen(false);
    setError(null);
  }

  const signedIn = Boolean(usernameLabel);

  return (
    <>
      {signedIn ? (
        <button
          type="button"
          className="hub-nav-auth-slot"
          aria-expanded={signOutOpen}
          title={usernameLabel || undefined}
          onClick={() => {
            setSignOutOpen((open) => !open);
            setError(null);
          }}
        >
          {usernameLabel}
        </button>
      ) : (
        <button
          type="button"
          className="hub-nav-auth-slot"
          aria-expanded={formOpen}
          onClick={() => {
            setFormOpen((open) => !open);
            setError(null);
          }}
        >
          {formOpen ? 'Cancel' : 'Sign in'}
        </button>
      )}
      <p className="hub-nav-subtitle">Personal apps</p>
      {error && (
        <p className="hub-nav-auth-error" role="alert">
          {error}
        </p>
      )}
      {signedIn && signOutOpen && (
        <button type="button" className="hub-nav-auth-sign-out" onClick={handleSignOut}>
          Sign out
        </button>
      )}
      {!signedIn && formOpen && (
        <form className="hub-nav-auth-form" onSubmit={(e) => void handleSignIn(e)}>
          <label className="hub-nav-auth-field">
            Username
            <input
              type="text"
              name="hub-nav-username"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(normalizeUsername(e.target.value))}
              autoCapitalize="none"
              spellCheck={false}
            />
          </label>
          <label className="hub-nav-auth-field">
            Password
            <input
              type="password"
              name="hub-nav-password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <button
            type="submit"
            className="hub-nav-auth-submit"
            disabled={signingIn || !username.trim() || !password}
          >
            {signingIn ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      )}
    </>
  );
}
