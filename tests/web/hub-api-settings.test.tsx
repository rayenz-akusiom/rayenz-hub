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

  it('saves URL without enabling API mode until sign-in', async () => {
    const user = userEvent.setup();
    render(<HubApiSettingsPage />);

    await user.clear(screen.getByLabelText('API base URL'));
    await user.type(screen.getByLabelText('API base URL'), 'http://127.0.0.1:3000/');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(screen.getByText(/API URL saved — sign in/i)).toBeInTheDocument();
    });
    expect(localStorage.getItem('rayenz-hub-api-url')).toBe('http://127.0.0.1:3000');
    expect(localStorage.getItem('rayenz-hub-api-key')).toBe(null);
  });

  it('clears stored credentials', async () => {
    const user = userEvent.setup();
    localStorage.setItem('rayenz-hub-api-url', 'http://127.0.0.1:3000');
    localStorage.setItem('rayenz-hub-api-key', 'test-api-key-local');
    render(<HubApiSettingsPage />);

    expect(screen.getByLabelText('API base URL')).toHaveValue('http://127.0.0.1:3000');
    await user.click(screen.getByRole('button', { name: 'Clear' }));

    expect(localStorage.getItem('rayenz-hub-api-url')).toBe(null);
    expect(localStorage.getItem('rayenz-hub-api-key')).toBe(null);
    expect(screen.getByText(/Cleared/i)).toBeInTheDocument();
  });

  it('rejects saving when URL matches page origin', async () => {
    const user = userEvent.setup();
    render(<HubApiSettingsPage />);
    const origin = location.origin.replace(/\/$/, '');

    await user.type(screen.getByLabelText('API base URL'), origin);
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/page's origin/i);
    });
    expect(localStorage.getItem('rayenz-hub-api-url')).toBe(null);
  });

  it('tests health without a session', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/v1/health')) {
        return { ok: true, status: 200, text: async () => '{"ok":true}' };
      }
      return { ok: true, status: 200, text: async () => '{"payload":{}}' };
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<HubApiSettingsPage />);
    await user.type(screen.getByLabelText('API base URL'), 'http://127.0.0.1:3000');
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
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 400,
      text: async () => JSON.stringify({ error: 'Cognito is not configured on this API', code: 'BAD_REQUEST' }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    render(<HubApiSettingsPage />);
    await user.type(screen.getByLabelText('API base URL'), 'http://127.0.0.1:3000');
    await user.type(screen.getByLabelText('Username'), 'Rayenz');
    await user.type(screen.getByLabelText('Password'), 'secret');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Cognito is not configured on this API');
    });
  });

  it('falls back to status when sign-in body is not JSON', () => {
    expect(signInErrorFromResponse(401, '<html>nope</html>').message).toBe('Sign-in failed (401).');
  });
});
