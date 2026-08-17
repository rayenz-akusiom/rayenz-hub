import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HubApiSettingsPage } from '../../packages/web/src/pages/HubApiSettingsPage';
import { getHubApiConfig } from '../../packages/web/src/api/hub-api-client';
import { clearHubAuthSession } from '../../packages/web/src/lib/hub-auth-session';

afterEach(() => {
  cleanup();
  localStorage.clear();
  sessionStorage.clear();
  clearHubAuthSession();
});

describe('Hub auth session UI', () => {
  it('client-only (no API URL) does not require sign-in', () => {
    render(<HubApiSettingsPage />);
    expect(screen.getByText(/localStorage only/i)).toBeInTheDocument();
    expect(getHubApiConfig().enabled).toBe(false);
  });

  it('shows sign-in controls when configuring the API', async () => {
    const user = userEvent.setup();
    render(<HubApiSettingsPage />);
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeDisabled();
    await user.type(screen.getByLabelText('Username'), 'Rayenz');
    await user.type(screen.getByLabelText('Password'), 'secret');
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
  });
});
