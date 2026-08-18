import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HubNav } from '../../packages/web/src/hub/HubNav';
import { signInErrorFromResponse } from '../../packages/web/src/lib/hub-auth-client';
import {
  clearHubAuthSession,
  notifyAuthRequired,
  setHubAuthSession,
} from '../../packages/web/src/lib/hub-auth-session';

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
  clearHubAuthSession();
  vi.unstubAllGlobals();
});

function renderNav() {
  return render(<HubNav path="/dailies" open={false} onClose={() => {}} />);
}

describe('HubNavAuth', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    clearHubAuthSession();
  });

  it('shows Sign in next to the persistent title when signed out', () => {
    renderNav();
    const nav = screen.getByRole('navigation', { name: 'Apps' });
    expect(within(nav).getByRole('heading', { name: 'Rayenz Hub' })).toBeInTheDocument();
    expect(within(nav).getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(within(nav).getByText('Personal apps')).toBeInTheDocument();
  });

  it('shows the username next to the title when signed in', () => {
    setHubAuthSession({ accessToken: 'test-access-token', username: 'Rayenz' });
    renderNav();
    expect(screen.getByRole('button', { name: 'Rayenz' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign in' })).not.toBeInTheDocument();
  });

  it('falls back to user when the session has no username', () => {
    setHubAuthSession({ accessToken: 'test-access-token' });
    renderNav();
    expect(screen.getByRole('button', { name: 'user' })).toBeInTheDocument();
  });

  it('expands compact sign-in controls in the nav', async () => {
    const user = userEvent.setup();
    renderNav();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    const submit = screen.getByRole('button', { name: 'Sign in' });
    expect(submit).toBeDisabled();
    await user.type(screen.getByLabelText('Username'), 'Rayenz');
    await user.type(screen.getByLabelText('Password'), 'secret');
    expect(submit).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByLabelText('Username')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('signs in against the resolved URL and shows the username', async () => {
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
      return { ok: false, status: 404, text: async () => '' };
    });
    vi.stubGlobal('fetch', fetchMock);

    renderNav();
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await user.type(screen.getByLabelText('Username'), 'Rayenz');
    await user.type(screen.getByLabelText('Password'), 'secret');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Rayenz' })).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalled();
  });

  it('signs out from the username control', async () => {
    const user = userEvent.setup();
    localStorage.setItem('rayenz-hub-api-url', 'http://127.0.0.1:3000');
    setHubAuthSession({ accessToken: 'access', username: 'Rayenz' });
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/v1/auth/sign-out')) {
        return { ok: true, status: 204, text: async () => '' };
      }
      return { ok: false, status: 404, text: async () => '' };
    });
    vi.stubGlobal('fetch', fetchMock);

    renderNav();
    await user.click(screen.getByRole('button', { name: 'Rayenz' }));
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalled();
  });

  it('toggles the sign-out control closed without signing out', async () => {
    const user = userEvent.setup();
    setHubAuthSession({ accessToken: 'access', username: 'Rayenz' });
    renderNav();
    await user.click(screen.getByRole('button', { name: 'Rayenz' }));
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Rayenz' }));
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rayenz' })).toBeInTheDocument();
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

    renderNav();
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await user.type(screen.getByLabelText('Username'), 'Rayenz');
    await user.type(screen.getByLabelText('Password'), 'secret');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Cognito is not configured on this API');
    });
  });

  it('rejects sign-in when this build has no API URL', async () => {
    const user = userEvent.setup();
    renderNav();
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await user.type(screen.getByLabelText('Username'), 'Rayenz');
    await user.type(screen.getByLabelText('Password'), 'secret');
    await user.click(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('This build has no Hub API URL.');
    });
  });

  it('returns to Sign in when the session expires', async () => {
    setHubAuthSession({ accessToken: 'test-access-token', username: 'Rayenz' });
    renderNav();
    expect(screen.getByRole('button', { name: 'Rayenz' })).toBeInTheDocument();
    notifyAuthRequired();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
      expect(screen.getByRole('alert')).toHaveTextContent('Session expired — sign in again.');
    });
  });

  it('falls back to status when sign-in body is not JSON', () => {
    expect(signInErrorFromResponse(401, '<html>nope</html>').message).toBe('Sign-in failed (401).');
  });
});
