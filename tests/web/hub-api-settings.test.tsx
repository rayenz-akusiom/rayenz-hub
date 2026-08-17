import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HubApiSettingsPage, signInErrorFromResponse } from '../../packages/web/src/pages/HubApiSettingsPage';

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
  vi.unstubAllGlobals();
});

describe('HubApiSettingsPage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('saves URL and key to localStorage', async () => {
    const user = userEvent.setup();
    render(<HubApiSettingsPage />);

    await user.clear(screen.getByLabelText('API base URL'));
    await user.type(screen.getByLabelText('API base URL'), 'http://127.0.0.1:3000/');
    await user.type(screen.getByLabelText('API key'), 'test-api-key-local');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(screen.getByText(/Configured — API mode on/i)).toBeInTheDocument();
    });
    expect(localStorage.getItem('rayenz-hub-api-url')).toBe('http://127.0.0.1:3000');
    expect(localStorage.getItem('rayenz-hub-api-key')).toBe('test-api-key-local');
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
    await user.type(screen.getByLabelText('API key'), 'key');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/page's origin/i);
    });
    expect(localStorage.getItem('rayenz-hub-api-url')).toBe(null);
  });

  it('tests health and auth when key is present', async () => {
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
    await user.type(screen.getByLabelText('API key'), 'test-api-key-local');
    await user.click(screen.getByRole('button', { name: 'Test connection' }));

    await waitFor(() => {
      expect(screen.getByText(/Connection OK/i)).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalled();
  });

  it('toggles API key visibility', async () => {
    const user = userEvent.setup();
    render(<HubApiSettingsPage />);
    const input = screen.getByLabelText('API key');
    expect(input).toHaveAttribute('type', 'password');

    await user.click(screen.getByRole('button', { name: 'Show key' }));
    expect(input).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Hide key' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: 'Hide key' }));
    expect(input).toHaveAttribute('type', 'password');
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
