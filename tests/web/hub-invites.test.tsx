import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InviteRedeemPage } from '../../packages/web/src/pages/InviteRedeemPage';
import { HubInvitesPage } from '../../packages/web/src/pages/HubInvitesPage';

afterEach(() => {
  cleanup();
  window.location.hash = '';
  localStorage.clear();
  sessionStorage.clear();
  vi.unstubAllGlobals();
});

describe('Hub invites UI', () => {
  it('tells visitors they need an invite without a token', () => {
    window.location.hash = '#/invite';
    render(<InviteRedeemPage />);
    expect(screen.getByText(/need an invite/i)).toBeInTheDocument();
  });

  it('shows redeem form when a token is in the hash', () => {
    window.location.hash = '#/invite/secret-token';
    render(<InviteRedeemPage />);
    expect(screen.getByLabelText(/Email/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Create account/i })).toBeInTheDocument();
  });

  it('asks for a confirmation code after register', async () => {
    const user = userEvent.setup();
    window.location.hash = '#/invite/secret-token';
    localStorage.setItem('rayenz-hub-api-url', 'http://127.0.0.1:3000');
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/v1/auth/register')) {
        expect(JSON.parse(String(init?.body))).toMatchObject({
          token: 'secret-token',
          username: 'friend',
          email: 'Friend@example.test',
        });
        return { ok: true, status: 201, text: async () => JSON.stringify({ status: 'CONFIRM_EMAIL', username: 'friend' }) };
      }
      if (url.endsWith('/v1/auth/confirm')) {
        expect(JSON.parse(String(init?.body))).toMatchObject({
          username: 'friend',
          code: '123456',
        });
        return {
          ok: true,
          status: 200,
          text: async () =>
            JSON.stringify({
              accessToken: 'access',
              idToken: 'id',
              refreshToken: 'refresh',
              username: 'friend',
              sub: 'friend-sub',
              expiresIn: 3600,
            }),
        };
      }
      return { ok: false, status: 404, text: async () => '' };
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<InviteRedeemPage />);
    await user.type(screen.getByLabelText(/Username/i), 'Friend');
    await user.type(screen.getByLabelText(/Email/i), 'Friend@example.test');
    await user.type(screen.getByLabelText(/Password/i), 'password1');
    await user.click(screen.getByRole('button', { name: /Create account/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/Confirmation code/i)).toBeInTheDocument();
    });
    await user.type(screen.getByLabelText(/Confirmation code/i), '123456');
    await user.click(screen.getByRole('button', { name: /Confirm email/i }));

    await waitFor(() => {
      expect(screen.getByText(/You are signed in/i)).toBeInTheDocument();
    });
    expect(sessionStorage.getItem('rayenz-hub-access-token')).toBe('access');
  });

  it('renders owner invite admin', () => {
    render(<HubInvitesPage />);
    expect(screen.getByRole('button', { name: /Create invite/i })).toBeInTheDocument();
  });
});
