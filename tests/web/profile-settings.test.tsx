import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProfileSettingsPage } from '../../packages/web/src/pages/ProfileSettingsPage';
import { notifyAuthRequired, setHubAuthSession } from '../../packages/web/src/lib/hub-auth-session';

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
  vi.unstubAllGlobals();
});

describe('ProfileSettingsPage', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('asks to sign in and hides the password form', () => {
    localStorage.setItem('rayenz-hub-api-url', 'http://127.0.0.1:3000');
    render(<ProfileSettingsPage />);
    expect(screen.getByText(/Sign in from the left nav to manage your profile/i)).toBeInTheDocument();
    expect(screen.queryByLabelText('Current password')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Test connection' })).not.toBeInTheDocument();
  });

  it('shows signed-in name without a password form when this build has no API URL', () => {
    setHubAuthSession({ accessToken: 'test-access-token', username: 'Rayenz' });
    render(<ProfileSettingsPage />);
    expect(screen.getByText(/Signed in as Rayenz/i)).toBeInTheDocument();
    expect(screen.queryByLabelText('Current password')).not.toBeInTheDocument();
  });

  it('shows the change-password form when signed in with an API URL', () => {
    localStorage.setItem('rayenz-hub-api-url', 'http://127.0.0.1:3000');
    setHubAuthSession({ accessToken: 'test-access-token', username: 'Rayenz' });
    render(<ProfileSettingsPage />);
    expect(screen.getByText(/Signed in as Rayenz/i)).toBeInTheDocument();
    expect(screen.getByLabelText('Current password')).toBeInTheDocument();
  });

  it('reveals the password form after signing in', async () => {
    localStorage.setItem('rayenz-hub-api-url', 'http://127.0.0.1:3000');
    render(<ProfileSettingsPage />);
    expect(screen.queryByLabelText('Current password')).not.toBeInTheDocument();
    setHubAuthSession({ accessToken: 'test-access-token', username: 'Rayenz' });
    await waitFor(() => {
      expect(screen.getByLabelText('Current password')).toBeInTheDocument();
    });
  });

  it('shows session expired when auth is required', async () => {
    localStorage.setItem('rayenz-hub-api-url', 'http://127.0.0.1:3000');
    setHubAuthSession({ accessToken: 'test-access-token', username: 'Rayenz' });
    render(<ProfileSettingsPage />);
    notifyAuthRequired();
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Session expired — sign in again.');
      expect(
        screen.getByText(/Sign in from the left nav to manage your profile/i),
      ).toBeInTheDocument();
    });
  });

  it('rejects a password confirm mismatch without calling the API', async () => {
    const user = userEvent.setup();
    localStorage.setItem('rayenz-hub-api-url', 'http://127.0.0.1:3000');
    setHubAuthSession({ accessToken: 'test-access-token', username: 'Rayenz' });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<ProfileSettingsPage />);
    await user.type(screen.getByLabelText('Current password'), 'old-pass');
    await user.type(screen.getByLabelText('New password'), 'Newpassw0rd');
    await user.type(screen.getByLabelText('Confirm new password'), 'Mismatch1');
    await user.click(screen.getByRole('button', { name: 'Update password' }));
    expect(screen.getByRole('alert')).toHaveTextContent('New passwords do not match.');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('updates the password when the form is valid', async () => {
    const user = userEvent.setup();
    localStorage.setItem('rayenz-hub-api-url', 'http://127.0.0.1:3000');
    setHubAuthSession({ accessToken: 'test-access-token', username: 'Rayenz' });
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => '{"ok":true}',
    }));
    vi.stubGlobal('fetch', fetchMock);
    render(<ProfileSettingsPage />);
    await user.type(screen.getByLabelText('Current password'), 'old-pass');
    await user.type(screen.getByLabelText('New password'), 'Newpassw0rd');
    await user.type(screen.getByLabelText('Confirm new password'), 'Newpassw0rd');
    await user.click(screen.getByRole('button', { name: 'Update password' }));
    await waitFor(() => {
      expect(screen.getByText('Password updated.')).toBeInTheDocument();
    });
    expect(screen.getByLabelText('Current password')).toHaveValue('');
    expect(fetchMock).toHaveBeenCalled();
    const calledUrl = String(fetchMock.mock.calls[0]?.[0]);
    expect(calledUrl).toContain('/v1/auth/change-password');
  });

  it('shows the API error when change-password fails', async () => {
    const user = userEvent.setup();
    localStorage.setItem('rayenz-hub-api-url', 'http://127.0.0.1:3000');
    setHubAuthSession({ accessToken: 'test-access-token', username: 'Rayenz' });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 400,
        text: async () => JSON.stringify({ error: 'Current password is incorrect', code: 'BAD_REQUEST' }),
      })),
    );
    render(<ProfileSettingsPage />);
    await user.type(screen.getByLabelText('Current password'), 'wrong-pass');
    await user.type(screen.getByLabelText('New password'), 'Newpassw0rd');
    await user.type(screen.getByLabelText('Confirm new password'), 'Newpassw0rd');
    await user.click(screen.getByRole('button', { name: 'Update password' }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Current password is incorrect');
    });
  });
});
