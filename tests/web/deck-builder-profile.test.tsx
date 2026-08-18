import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
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

vi.mock('../../packages/web/src/api/hub-api-client', () => ({
  pullPublicProfileYaml: vi.fn(),
}));

import { readProfileForDeck } from '../../packages/web/src/deck-suggest/data';
import { pullPublicProfileYaml } from '../../packages/web/src/api/hub-api-client';

const commanderDoc = commanderFixture as DeckDocument;
const readProfile = vi.mocked(readProfileForDeck);
const pullPublic = vi.mocked(pullPublicProfileYaml);

afterEach(() => {
  cleanup();
  window.location.hash = '';
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
    expect(pullPublic).not.toHaveBeenCalled();
  });

  it('uses authenticated reads for owner/library hashes', async () => {
    window.location.hash = '#/commander-builder/sandbox/fixture-commander';
    readProfile.mockResolvedValue({ format: 'commander', tags: ['tokens'] });
    const profile = await loadDeckProfile(commanderDoc);
    expect(profile?.tags).toEqual(['tokens']);
    expect(readProfile).toHaveBeenCalled();
    expect(pullPublic).not.toHaveBeenCalled();
  });

  it('loads public YAML on a guest deep link instead of authenticated reads', async () => {
    window.location.hash = '#/commander-builder/other-user/fixture-commander';
    pullPublic.mockResolvedValue('format: commander\ntags:\n  - aggro\n');
    const profile = await loadDeckProfile(commanderDoc);
    expect(profile?.format).toBe('commander');
    expect(profile?.tags).toEqual(['aggro']);
    expect(pullPublic).toHaveBeenCalledWith('other-user', 'fixture-commander');
    expect(readProfile).not.toHaveBeenCalled();
  });
});

describe('DeckProfilePanel', () => {
  it('shows empty state without a connect-folder action', async () => {
    readProfile.mockResolvedValue(null);

    render(<DeckProfilePanel deck={commanderDoc} />);

    await waitFor(() => {
      expect(screen.getByText('No profile linked for this deck.')).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: /Connect profiles folder/i })).not.toBeInTheDocument();
  });

  it('renders structured profile fields', async () => {
    readProfile.mockResolvedValue({
      format: 'commander',
      tags: ['aggro'],
      roles: [{ id: 'draw', priority: 'medium', tags: ['card_advantage'] }],
      protected_cards: ['Lightning Bolt'],
      blocked_cards: ['Counterspell'],
    });

    render(<DeckProfilePanel deck={commanderDoc} />);

    await waitFor(() => {
      expect(screen.getByText(/commander/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/aggro/)).toBeInTheDocument();
    expect(screen.getByText('draw')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Protected (1)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Blocked (1)' })).toBeInTheDocument();
  });

  it('renders a public-route profile from YAML', async () => {
    window.location.hash = '#/commander-builder/other-user/fixture-commander';
    pullPublic.mockResolvedValue('format: commander\ntags:\n  - tokens\n');

    render(<DeckProfilePanel deck={commanderDoc} />);

    await waitFor(() => {
      expect(screen.getByText(/tokens/)).toBeInTheDocument();
    });
    expect(readProfile).not.toHaveBeenCalled();
    expect(pullPublic).toHaveBeenCalledWith('other-user', 'fixture-commander');
  });
});
