import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DeckDocument } from '@rayenz-hub/shared';
import { BrowseShell } from '../../packages/web/src/deck-builder/browse/BrowseShell';
import commanderFixture from '../fixtures/deck-builder/commander-slice.json';

vi.mock('../../packages/web/src/api/hub-api', () => ({
  isApiConfigured: () => false,
  getHubApiConfig: () => ({ url: '', key: '', enabled: false }),
  loadDeckBuilderSettings: async () => ({ settings: null, source: 'defaults' }),
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

function baseDeck(): DeckDocument {
  return {
    ...(commanderFixture as DeckDocument),
    browseViewDefault: 'category',
    cardLayoutDefault: 'stacked',
    cardSortDefault: 'name_asc',
    categories: (commanderFixture as DeckDocument).categories.map((c) => ({
      ...c,
      target: null,
    })),
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('BrowseShell prefs and category targets persistence', () => {
  it('persists browse view, layout, and sort onto the deck document', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<BrowseShell deck={baseDeck()} onChange={onChange} onBack={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /Browse/i }));
    await user.click(screen.getByRole('menuitem', { name: 'Colour identity' }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ browseViewDefault: 'colour_identity' }),
    );

    onChange.mockClear();
    await user.click(screen.getByRole('button', { name: /Layout/i }));
    await user.click(screen.getByRole('menuitem', { name: 'Grid' }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ cardLayoutDefault: 'grid' }),
    );

    onChange.mockClear();
    await user.click(screen.getByRole('button', { name: /Sort/i }));
    await user.click(screen.getByRole('menuitem', { name: 'Mana value ↑' }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        cardSortDefault: 'mana_asc',
      }),
    );
  });

  it('keeps category targets when a later layout change commits', async () => {
    const user = userEvent.setup();
    let deck = baseDeck();
    const onChange = vi.fn((next: DeckDocument) => {
      deck = next;
    });
    const { rerender } = render(
      <BrowseShell deck={deck} onChange={onChange} onBack={vi.fn()} />,
    );

    // Simulate category target save (as CategoryEditDialog would via onChange).
    const withTargets: DeckDocument = {
      ...deck,
      categories: deck.categories.map((c) =>
        c.name === 'Creature' ? { ...c, target: 12 } : c,
      ),
      updatedAt: new Date().toISOString(),
    };
    onChange(withTargets);
    deck = withTargets;
    rerender(<BrowseShell deck={deck} onChange={onChange} onBack={vi.fn()} />);

    onChange.mockClear();
    await user.click(screen.getByRole('button', { name: /Layout/i }));
    await user.click(screen.getByRole('menuitem', { name: 'Grid' }));

    const last = onChange.mock.calls.at(-1)![0] as DeckDocument;
    expect(last.cardLayoutDefault).toBe('grid');
    expect(last.categories.find((c) => c.name === 'Creature')?.target).toBe(12);
  });
});
