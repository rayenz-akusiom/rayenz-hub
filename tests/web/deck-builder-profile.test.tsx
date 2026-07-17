import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DeckDocument } from '@rayenz-hub/shared';
import {
  DeckProfilePanel,
  loadDeckProfile,
  profileLookupKeys,
} from '../../packages/web/src/deck-builder/profile/DeckProfilePanel';
import commanderFixture from '../fixtures/deck-builder/commander-slice.json';

vi.mock('../../packages/web/src/deck-suggest/data', () => ({
  readProfileForDeck: vi.fn(),
}));

vi.mock('../../packages/web/src/mtg/profile-sync', () => ({
  ProfileSync: {
    isConnected: vi.fn(),
    connectProfilesDir: vi.fn(),
    readProfileYaml: vi.fn(),
  },
}));

import { readProfileForDeck } from '../../packages/web/src/deck-suggest/data';
import { ProfileSync } from '../../packages/web/src/mtg/profile-sync';

const commanderDoc = commanderFixture as DeckDocument;
const readProfile = vi.mocked(readProfileForDeck);
const isConnected = vi.mocked(ProfileSync.isConnected);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('profileLookupKeys', () => {
  it('returns deckId then archidekt variants without duplicates', () => {
    expect(profileLookupKeys({ deckId: '12345', archidektId: 12345 })).toEqual([
      '12345',
      'deck-12345',
    ]);
    expect(profileLookupKeys({ deckId: 'deck-9', archidektId: 9 })).toEqual([
      'deck-9',
      '9',
    ]);
    expect(profileLookupKeys({ deckId: 'local-1', archidektId: null })).toEqual(['local-1']);
  });
});

describe('loadDeckProfile', () => {
  it('tries keys until a non-empty profile is found', async () => {
    readProfile.mockImplementation(async (id) => {
      if (id === 'deck-1') {
        return {
          format: 'commander',
          tags: ['tokens'],
          roles: [{ id: 'ramp', priority: 'high' }],
          protected_cards: ['Sol Ring'],
          blocked_cards: [],
        };
      }
      return null;
    });
    const profile = await loadDeckProfile({ deckId: '1', archidektId: 1 });
    expect(profile?.tags).toEqual(['tokens']);
    expect(readProfile).toHaveBeenCalledWith('1');
    expect(readProfile).toHaveBeenCalledWith('deck-1');
  });
});

describe('DeckProfilePanel', () => {
  it('shows empty state and connect when not connected', async () => {
    readProfile.mockResolvedValue(null);
    isConnected.mockResolvedValue(false);
    const user = userEvent.setup();
    const connect = vi.mocked(ProfileSync.connectProfilesDir);
    connect.mockResolvedValue(undefined);

    render(<DeckProfilePanel deck={commanderDoc} />);

    await waitFor(() => {
      expect(screen.getByText('No profile linked for this deck.')).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: 'Connect profiles folder' }));
    expect(connect).toHaveBeenCalled();
  });

  it('renders structured profile fields', async () => {
    readProfile.mockResolvedValue({
      format: 'commander',
      tags: ['aggro'],
      roles: [{ id: 'draw', priority: 'medium', tags: ['card_advantage'] }],
      protected_cards: ['Lightning Bolt'],
      blocked_cards: ['Counterspell'],
    });
    isConnected.mockResolvedValue(true);

    render(<DeckProfilePanel deck={commanderDoc} />);

    await waitFor(() => {
      expect(screen.getByText(/commander/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/aggro/)).toBeInTheDocument();
    expect(screen.getByText('draw')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Protected (1)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Blocked (1)' })).toBeInTheDocument();
  });
});
