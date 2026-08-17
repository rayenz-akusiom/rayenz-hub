import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { InviteRedeemPage } from '../../packages/web/src/pages/InviteRedeemPage';
import { HubInvitesPage } from '../../packages/web/src/pages/HubInvitesPage';

afterEach(() => {
  cleanup();
  window.location.hash = '';
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
    expect(screen.getByRole('button', { name: /Create account/i })).toBeInTheDocument();
  });

  it('renders owner invite admin', () => {
    render(<HubInvitesPage />);
    expect(screen.getByRole('button', { name: /Create invite/i })).toBeInTheDocument();
  });
});
