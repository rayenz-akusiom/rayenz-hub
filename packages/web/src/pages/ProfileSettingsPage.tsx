import { useEffect, useState, type FormEvent } from 'react';
import { getHubApiConfig } from '../api/hub-api';
import { changePassword } from '../lib/hub-auth-client';
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

function canChangePassword(): boolean {
  return Boolean(getHubAuthSession() && getHubApiConfig().url);
}

export function ProfileSettingsPage() {
  const [username, setUsername] = useState<string | null>(() => sessionUsername());
  const [error, setError] = useState<string | null>(null);
  const [showPasswordForm, setShowPasswordForm] = useState(canChangePassword);
  const [previousPassword, setPreviousPassword] = useState('');
  const [proposedPassword, setProposedPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordStatus, setPasswordStatus] = useState<string | null>(null);

  function refreshSession() {
    setUsername(sessionUsername());
    setShowPasswordForm(canChangePassword());
  }

  useEffect(() => {
    refreshSession();
    const onAuthChanged = () => {
      refreshSession();
    };
    const onAuthRequired = () => {
      setError('Session expired — sign in again.');
      setPasswordStatus(null);
      refreshSession();
    };
    window.addEventListener(HUB_AUTH_CHANGED_EVENT, onAuthChanged);
    window.addEventListener(HUB_AUTH_REQUIRED_EVENT, onAuthRequired);
    return () => {
      window.removeEventListener(HUB_AUTH_CHANGED_EVENT, onAuthChanged);
      window.removeEventListener(HUB_AUTH_REQUIRED_EVENT, onAuthRequired);
    };
  }, []);

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
      <h2 className="hub-web-section-title">Profile</h2>
      {username ? (
        <p className="hub-web-hint">Signed in as {username}.</p>
      ) : (
        <p className="hub-web-hint">Sign in from the left nav to manage your profile.</p>
      )}

      {error && (
        <div className="hub-web-banner hub-web-banner--error" role="alert">
          {error}
        </div>
      )}

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
