import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HubApiSettingsPage } from '../../packages/web/src/pages/HubApiSettingsPage';
import { notifyAuthRequired, setHubAuthSession } from '../../packages/web/src/lib/hub-auth-session';

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
  vi.unstubAllGlobals();
});

describe('HubApiSettingsPage', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('shows the resolved URL and asks to sign in', () => {
    localStorage.setItem('rayenz-hub-api-url', 'http://127.0.0.1:3000');
    render(<HubApiSettingsPage />);
    expect(screen.getByText('http://127.0.0.1:3000')).toBeInTheDocument();
    expect(screen.getByText(/Sign in from the nav to enable API mode/i)).toBeInTheDocument();
    expect(screen.queryByLabelText('API base URL')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Username')).not.toBeInTheDocument();
  });

  it('tests health without a session', async () => {
    const user = userEvent.setup();
    localStorage.setItem('rayenz-hub-api-url', 'http://127.0.0.1:3000');
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/v1/health')) {
        return { ok: true, status: 200, text: async () => '{"ok":true}' };
      }
      return { ok: true, status: 200, text: async () => '{"payload":{}}' };
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<HubApiSettingsPage />);
    await user.click(screen.getByRole('button', { name: 'Test connection' }));

    await waitFor(() => {
      expect(screen.getByText(/Health OK — sign in/i)).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalled();
  });

  it('tests health and session when signed in', async () => {
    const user = userEvent.setup();
    localStorage.setItem('rayenz-hub-api-url', 'http://127.0.0.1:3000');
    setHubAuthSession({ accessToken: 'test-access-token', username: 'Rayenz' });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/v1/health')) {
        return { ok: true, status: 200, text: async () => '{"ok":true}' };
      }
      return { ok: true, status: 200, text: async () => '{"username":"Rayenz"}' };
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<HubApiSettingsPage />);
    await user.click(screen.getByRole('button', { name: 'Test connection' }));

    await waitFor(() => {
      expect(screen.getByText(/Connection OK/i)).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalled();
  });

  it('treats a missing auth me endpoint as OK', async () => {
    const user = userEvent.setup();
    localStorage.setItem('rayenz-hub-api-url', 'http://127.0.0.1:3000');
    setHubAuthSession({ accessToken: 'test-access-token', username: 'Rayenz' });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/v1/health')) {
        return { ok: true, status: 200, text: async () => '{"ok":true}' };
      }
      return { ok: false, status: 404, text: async () => '' };
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<HubApiSettingsPage />);
    await user.click(screen.getByRole('button', { name: 'Test connection' }));
    await waitFor(() => {
      expect(screen.getByText(/Connection OK/i)).toBeInTheDocument();
    });
  });

  it('reports a failed health check', async () => {
    const user = userEvent.setup();
    localStorage.setItem('rayenz-hub-api-url', 'http://127.0.0.1:3000');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 503, text: async () => '' })),
    );
    render(<HubApiSettingsPage />);
    await user.click(screen.getByRole('button', { name: 'Test connection' }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Health check failed (503).');
    });
  });

  it('reports unauthorized when testing a session', async () => {
    const user = userEvent.setup();
    localStorage.setItem('rayenz-hub-api-url', 'http://127.0.0.1:3000');
    setHubAuthSession({ accessToken: 'test-access-token', username: 'Rayenz' });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/v1/health')) {
        return { ok: true, status: 200, text: async () => '{"ok":true}' };
      }
      return { ok: false, status: 401, text: async () => '' };
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<HubApiSettingsPage />);
    await user.click(screen.getByRole('button', { name: 'Test connection' }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Unauthorized — sign in again.');
    });
  });

  it('reports a failed API check', async () => {
    const user = userEvent.setup();
    localStorage.setItem('rayenz-hub-api-url', 'http://127.0.0.1:3000');
    setHubAuthSession({ accessToken: 'test-access-token', username: 'Rayenz' });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/v1/health')) {
        return { ok: true, status: 200, text: async () => '{"ok":true}' };
      }
      return { ok: false, status: 500, text: async () => '' };
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<HubApiSettingsPage />);
    await user.click(screen.getByRole('button', { name: 'Test connection' }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('API check failed (500).');
    });
  });

  it('rejects test connection when this build has no API URL', async () => {
    const user = userEvent.setup();
    render(<HubApiSettingsPage />);
    expect(screen.getByText(/This build has no API URL/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Test connection' }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('This build has no Hub API URL.');
    });
  });

  it('shows a signed-in status when the session exists without an API URL', () => {
    setHubAuthSession({ accessToken: 'test-access-token', username: 'Rayenz' });
    render(<HubApiSettingsPage />);
    expect(screen.getByText(/this build has no Hub API URL/i)).toBeInTheDocument();
  });

  it('refreshes status when the nav session changes', async () => {
    localStorage.setItem('rayenz-hub-api-url', 'http://127.0.0.1:3000');
    render(<HubApiSettingsPage />);
    expect(screen.getByText(/Sign in from the nav to enable API mode/i)).toBeInTheDocument();
    setHubAuthSession({ accessToken: 'test-access-token', username: 'Rayenz' });
    await waitFor(() => {
      expect(screen.getByText(/Signed in as Rayenz — API mode on/i)).toBeInTheDocument();
    });
  });

  it('shows session expired when auth is required', async () => {
    localStorage.setItem('rayenz-hub-api-url', 'http://127.0.0.1:3000');
    setHubAuthSession({ accessToken: 'test-access-token', username: 'Rayenz' });
    render(<HubApiSettingsPage />);
    notifyAuthRequired();
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Session expired — sign in again.');
      expect(screen.getByText(/Sign in from the nav to enable API mode/i)).toBeInTheDocument();
    });
  });

  it('hides the change-password form until signed in', () => {
    localStorage.setItem('rayenz-hub-api-url', 'http://127.0.0.1:3000');
    render(<HubApiSettingsPage />);
    expect(screen.queryByLabelText('Current password')).not.toBeInTheDocument();
  });

  it('rejects a password confirm mismatch without calling the API', async () => {
    const user = userEvent.setup();
    localStorage.setItem('rayenz-hub-api-url', 'http://127.0.0.1:3000');
    setHubAuthSession({ accessToken: 'test-access-token', username: 'Rayenz' });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<HubApiSettingsPage />);
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
    render(<HubApiSettingsPage />);
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
    render(<HubApiSettingsPage />);
    await user.type(screen.getByLabelText('Current password'), 'wrong-pass');
    await user.type(screen.getByLabelText('New password'), 'Newpassw0rd');
    await user.type(screen.getByLabelText('Confirm new password'), 'Newpassw0rd');
    await user.click(screen.getByRole('button', { name: 'Update password' }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Current password is incorrect');
    });
  });
});
