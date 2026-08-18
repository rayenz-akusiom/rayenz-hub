import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HubApiSettingsPage, signInErrorFromResponse } from '../../packages/web/src/pages/HubApiSettingsPage';
import { setHubAuthSession } from '../../packages/web/src/lib/hub-auth-session';

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
    expect(screen.getByText(/Sign in to enable API mode/i)).toBeInTheDocument();
    expect(screen.queryByLabelText('API base URL')).not.toBeInTheDocument();
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

  it('shows the API error body when sign-in fails', async () => {
    const user = userEvent.setup();
    localStorage.setItem('rayenz-hub-api-url', 'http://127.0.0.1:3000');
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({ error: 'Cognito is not configured on this API', code: 'BAD_REQUEST' }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    render(<HubApiSettingsPage />);
    await user.type(screen.getByLabelText('Username'), 'Rayenz');
    await user.type(screen.getByLabelText('Password'), 'secret');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Cognito is not configured on this API');
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

  it('rejects sign-in when this build has no API URL', async () => {
    const user = userEvent.setup();
    render(<HubApiSettingsPage />);
    await user.type(screen.getByLabelText('Username'), 'Rayenz');
    await user.type(screen.getByLabelText('Password'), 'secret');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('This build has no Hub API URL.');
    });
  });

  it('shows a signed-in status when the session exists without an API URL', () => {
    setHubAuthSession({ accessToken: 'test-access-token', username: 'Rayenz' });
    render(<HubApiSettingsPage />);
    expect(screen.getByText(/this build has no Hub API URL/i)).toBeInTheDocument();
  });

  it('falls back to status when sign-in body is not JSON', () => {
    expect(signInErrorFromResponse(401, '<html>nope</html>').message).toBe('Sign-in failed (401).');
  });

  it('signs in and signs out against the resolved URL', async () => {
    const user = userEvent.setup();
    localStorage.setItem('rayenz-hub-api-url', 'http://127.0.0.1:3000');
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/v1/auth/sign-in')) {
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              accessToken: 'access',
              username: 'Rayenz',
              sub: 'rayenz-sub',
            }),
        };
      }
      if (url.endsWith('/v1/auth/sign-out')) {
        return { ok: true, status: 204, text: async () => '' };
      }
      return { ok: false, status: 404, text: async () => '' };
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<HubApiSettingsPage />);
    await user.type(screen.getByLabelText('Username'), 'Rayenz');
    await user.type(screen.getByLabelText('Password'), 'secret');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(screen.getByText(/Signed in as Rayenz — API mode on/i)).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(screen.getByText(/Signed out/i)).toBeInTheDocument();
  });
});
