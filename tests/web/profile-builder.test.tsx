import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProfileBuilderApp } from '../../packages/web/src/profile-builder/ProfileBuilderApp';

vi.mock('../../packages/web/src/deck-suggest/data', () => ({
  loadHubLibraryDecks: vi.fn(async () => [
    {
      deck_id: 'd1',
      deck_name: 'Test Deck',
      deck_snapshot: {
        cards: [
          { name: 'Sol Ring', categories: ['Artifact'] },
          { name: 'Lightning Bolt', categories: ['Instant'] },
        ],
      },
    },
  ]),
}));

vi.mock('../../packages/web/src/api/hub-api-client', () => ({
  HubApiClient: {
    pullProfileYaml: vi.fn(async () => null),
    pushProfile: vi.fn(async () => ({})),
    apiFetch: vi.fn(async () => ({
      tags: ['artifact', 'mana-production'],
      byCard: { 'Sol Ring': ['artifact', 'mana-production'] },
      cardsMissing: [],
    })),
  },
}));

afterEach(() => {
  cleanup();
  window.location.hash = '#/profile-builder?deckId=d1';
});

describe('ProfileBuilderApp', () => {
  it('limits representative selection to five cards', async () => {
    const user = userEvent.setup();
    render(<ProfileBuilderApp />);
    await waitFor(() => {
      expect(screen.getByText('Test Deck')).toBeInTheDocument();
    });
    const toggles = await screen.findAllByRole('listitem');
    expect(toggles.length).toBeGreaterThan(0);
    await user.click(toggles[0]);
    expect(screen.getByText('1 of 5 selected')).toBeInTheDocument();
  });

  it('loads tags and saves profile', async () => {
    const user = userEvent.setup();
    const { HubApiClient } = await import('../../packages/web/src/api/hub-api-client');
    render(<ProfileBuilderApp />);
    await waitFor(() => {
      expect(screen.getByText('Sol Ring')).toBeInTheDocument();
    });
    await user.click(screen.getByRole('listitem', { name: 'Sol Ring' }));
    await waitFor(() => {
      expect(screen.getByLabelText('artifact')).toBeInTheDocument();
    });
    await user.click(screen.getByLabelText('artifact'));
    await user.click(screen.getByRole('button', { name: 'Save profile' }));
    await waitFor(() => {
      expect(HubApiClient.pushProfile).toHaveBeenCalled();
    });
  });
});
