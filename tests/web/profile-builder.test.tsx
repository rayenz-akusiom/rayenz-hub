import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

beforeEach(async () => {
  const { HubApiClient } = await import('../../packages/web/src/api/hub-api-client');
  vi.mocked(HubApiClient.pullProfileYaml).mockResolvedValue(null);
  vi.mocked(HubApiClient.pushProfile).mockResolvedValue({});
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

  it('applies Storm template and saves theme seeds in YAML', async () => {
    const user = userEvent.setup();
    const { HubApiClient } = await import('../../packages/web/src/api/hub-api-client');
    render(<ProfileBuilderApp />);
    await waitFor(() => {
      expect(screen.getByLabelText('Profile template')).toBeInTheDocument();
    });
    await user.selectOptions(screen.getByLabelText('Profile template'), 'storm');
    await user.click(screen.getByRole('button', { name: 'Apply template' }));
    expect(screen.getByText('storm-count-matters')).toBeInTheDocument();
    expect(screen.getByText('storm-like')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save profile' }));
    await waitFor(() => {
      expect(HubApiClient.pushProfile).toHaveBeenCalled();
    });
    const [, body] = vi.mocked(HubApiClient.pushProfile).mock.calls.at(-1)!;
    const yaml = String((body as { yaml?: string }).yaml || '');
    expect(yaml).toContain('storm-count-matters');
    expect(yaml).toContain('storm-like');
    expect(yaml).toMatch(/themes:/);
  });

  it('applies Typal template with configured types and saves typal_types', async () => {
    const user = userEvent.setup();
    const { HubApiClient } = await import('../../packages/web/src/api/hub-api-client');
    render(<ProfileBuilderApp />);
    await waitFor(() => {
      expect(screen.getByLabelText('Profile template')).toBeInTheDocument();
    });
    await user.selectOptions(screen.getByLabelText('Profile template'), 'typal');
    await user.type(screen.getByLabelText('Types'), 'Elf, Wizard');
    await user.click(screen.getByRole('button', { name: 'Apply template' }));
    expect(screen.getByText('Elf')).toBeInTheDocument();
    expect(screen.getByText('Wizard')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save profile' }));
    await waitFor(() => {
      expect(HubApiClient.pushProfile).toHaveBeenCalled();
    });
    const [, body] = vi.mocked(HubApiClient.pushProfile).mock.calls.at(-1)!;
    const yaml = String((body as { yaml?: string }).yaml || '');
    expect(yaml).toMatch(/typal_types:/);
    expect(yaml).toContain('Elf');
    expect(yaml).toContain('Wizard');
  });
});
