import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { defaultPendragonCategoryDefs, type DeckDocument } from '@rayenz-hub/shared';
import { BrowseShell } from '../../packages/web/src/deck-builder/browse/BrowseShell';
import { emptyDeckDocument } from '../../packages/web/src/deck-builder/import-export/import-deck';

const { searchCards } = vi.hoisted(() => ({
  searchCards: vi.fn(),
}));

vi.mock('@rayenz-hub/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@rayenz-hub/shared')>();
  return {
    ...actual,
    searchCards: (...args: unknown[]) => searchCards(...args),
  };
});

vi.mock('../../packages/web/src/api/hub-api', () => ({
  isApiConfigured: () => false,
  getHubApiConfig: () => ({ url: '', enabled: false }),
}));

vi.mock('../../packages/web/src/deck-builder/scryfall/useScryfallEnrich', () => ({
  useScryfallEnrich: () => ({ enriching: false }),
}));

vi.mock('../../packages/web/src/deck-suggest/data', () => ({
  readProfileForDeck: vi.fn(async () => null),
}));

vi.mock('../../packages/web/src/mtg/profile-sync', () => ({
  ProfileSync: {
    isConnected: vi.fn(async () => false),
    connectProfilesDir: vi.fn(async () => {}),
    readProfileYaml: vi.fn(async () => null),
  },
}));

function emptyPendragonDeck(): DeckDocument {
  return emptyDeckDocument({
    name: 'New Pendragon deck',
    format: 'pendragon',
    categories: defaultPendragonCategoryDefs(),
  });
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  searchCards.mockResolvedValue({
    data: [],
    has_more: false,
    next_page: null,
  });
});

describe('Pendragon BrowseShell slots', () => {
  it('opens Arthur search with the creature + commons commander-legal clause', async () => {
    const user = userEvent.setup();
    render(<BrowseShell deck={emptyPendragonDeck()} onChange={vi.fn()} onBack={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Choose Arthur' }));
    expect(screen.getByRole('dialog', { name: 'Choose Arthur' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() => {
      expect(searchCards).toHaveBeenCalledWith('t:creature r:c legal:commander', 1);
    });
  });

  it('opens Excalibur search with the legendary equipment clause', async () => {
    const user = userEvent.setup();
    render(<BrowseShell deck={emptyPendragonDeck()} onChange={vi.fn()} onBack={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Choose Excalibur' }));
    expect(screen.getByRole('dialog', { name: 'Choose Excalibur' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() => {
      expect(searchCards).toHaveBeenCalledWith('legal:commander (t:legendary t:equipment)', 1);
    });
  });

  it('uses r:c legal:commander when adding to the 98', async () => {
    const user = userEvent.setup();
    render(<BrowseShell deck={emptyPendragonDeck()} onChange={vi.fn()} onBack={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Add card' }));
    expect(screen.getByRole('dialog', { name: 'Add card from Scryfall' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() => {
      expect(searchCards).toHaveBeenCalledWith('r:c legal:commander', 1);
    });
  });
});
