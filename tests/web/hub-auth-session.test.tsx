import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
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
    expect(screen.getByText(/this build has no Hub API URL/i)).toBeInTheDocument();
    expect(getHubApiConfig().enabled).toBe(false);
  });
});
