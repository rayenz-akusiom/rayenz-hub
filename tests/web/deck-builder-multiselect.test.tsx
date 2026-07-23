import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DeckDocument } from '@rayenz-hub/shared';
import { BrowseShell } from '../../packages/web/src/deck-builder/browse/BrowseShell';
import {
  DRAG_MIME,
  DRAG_MIME_MULTI,
} from '../../packages/web/src/deck-builder/browse/CardTile';
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
  const fixture = commanderFixture as DeckDocument;
  return {
    ...fixture,
    cards: fixture.cards.map((c) => ({
      ...c,
      foil: false,
      proxy: false,
      primaryCategory: 'Maybeboard',
      categories: ['Maybeboard'],
    })),
    categories: [
      ...(fixture.categories || []),
      { name: 'Maybeboard', includedInDeck: false, includedInPrice: false, target: null },
    ],
    oracle: {
      'name:birds of paradise': {
        scryfallId: null,
        colourIdentity: ['G'],
        typeLine: 'Creature — Bird',
        layout: 'normal',
        keywords: null,
        partnerWith: null,
        oracleText: null,
        printedName: null,
        flavorName: null,
        manaValue: 1,
        imageUrl: null,
        finishes: ['nonfoil', 'foil'],
        updatedAt: null,
      },
      'name:forest': {
        scryfallId: null,
        colourIdentity: ['G'],
        typeLine: 'Basic Land — Forest',
        layout: 'normal',
        keywords: null,
        partnerWith: null,
        oracleText: null,
        printedName: null,
        flavorName: null,
        manaValue: 0,
        imageUrl: null,
        finishes: ['nonfoil'],
        updatedAt: null,
      },
      'name:counterspell': {
        scryfallId: null,
        colourIdentity: ['U'],
        typeLine: 'Instant',
        layout: 'normal',
        keywords: null,
        partnerWith: null,
        oracleText: null,
        printedName: null,
        flavorName: null,
        manaValue: 2,
        imageUrl: null,
        finishes: ['nonfoil'],
        updatedAt: null,
      },
    },
  };
}

/** Counterspell in main; Birds + Forest in Maybeboard (aside). */
function splitMainAsideDeck(): DeckDocument {
  const deck = baseDeck();
  return {
    ...deck,
    cards: deck.cards.map((c) => {
      if (c.name === 'Counterspell') {
        return { ...c, primaryCategory: 'Instant', categories: ['Instant'] };
      }
      return c;
    }),
    categories: [
      ...deck.categories,
      { name: 'Instant', includedInDeck: true, includedInPrice: true, target: null },
    ],
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('BrowseShell multiselect', () => {
  it('ctrl-click selects multiple cards and shows selection count', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const deck = baseDeck();
    render(<BrowseShell deck={deck} onChange={onChange} onBack={vi.fn()} />);

    const birds = screen.getByRole('button', { name: 'Birds of Paradise' });
    const forest = screen.getByRole('button', { name: 'Forest' });

    await user.click(birds);
    expect(screen.getByText('1 selected')).toBeInTheDocument();

    await user.keyboard('{Control>}');
    await user.click(forest);
    await user.keyboard('{/Control}');

    expect(screen.getByText('2 selected')).toBeInTheDocument();
    expect(birds).toHaveClass('is-selected');
    expect(forest).toHaveClass('is-selected');
    expect(screen.queryByRole('button', { name: 'Change printing…' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Set as cover' })).not.toBeInTheDocument();
  });

  it('dragstart on a selected card encodes the full multi-selection', async () => {
    const user = userEvent.setup();
    render(<BrowseShell deck={baseDeck()} onChange={vi.fn()} onBack={vi.fn()} />);

    const birds = screen.getByRole('button', { name: 'Birds of Paradise' });
    const forest = screen.getByRole('button', { name: 'Forest' });
    await user.click(birds);
    await user.keyboard('{Control>}');
    await user.click(forest);
    await user.keyboard('{/Control}');

    const data: Record<string, string> = {};
    fireEvent.dragStart(birds, {
      dataTransfer: {
        setData: (type: string, value: string) => {
          data[type] = value;
        },
        effectAllowed: 'move',
      },
    });

    expect(data[DRAG_MIME]).toBe('c1');
    expect(JSON.parse(data[DRAG_MIME_MULTI]!)).toEqual(['c1', 'c2']);
  });

  it('Move to default files selected cards by type', async () => {
    const user = userEvent.setup();
    let deck = baseDeck();
    const onChange = vi.fn((next: DeckDocument) => {
      deck = next;
    });
    const { rerender } = render(
      <BrowseShell deck={deck} onChange={onChange} onBack={vi.fn()} />,
    );

    const birds = screen.getByRole('button', { name: 'Birds of Paradise' });
    const forest = screen.getByRole('button', { name: 'Forest' });
    await user.click(birds);
    await user.keyboard('{Control>}');
    await user.click(forest);
    await user.keyboard('{/Control}');

    await user.click(screen.getByRole('button', { name: 'Move to default' }));
    expect(onChange).toHaveBeenCalled();
    const next = onChange.mock.calls.at(-1)![0] as DeckDocument;
    expect(next.cards.find((c) => c.name === 'Birds of Paradise')?.primaryCategory).toBe(
      'Creature',
    );
    expect(next.cards.find((c) => c.name === 'Forest')?.primaryCategory).toBe('Land');

    rerender(<BrowseShell deck={next} onChange={onChange} onBack={vi.fn()} />);
  });

  it('plain click collapses multi-selection to one card', async () => {
    const user = userEvent.setup();
    render(<BrowseShell deck={baseDeck()} onChange={vi.fn()} onBack={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Birds of Paradise' }));
    await user.keyboard('{Control>}');
    await user.click(screen.getByRole('button', { name: 'Forest' }));
    await user.keyboard('{/Control}');
    expect(screen.getByText('2 selected')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Counterspell' }));
    expect(screen.getByText('1 selected')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change printing…' })).toBeInTheDocument();
  });

  it('Remove confirms once for multi-select', async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onChange = vi.fn();
    render(<BrowseShell deck={baseDeck()} onChange={onChange} onBack={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Birds of Paradise' }));
    await user.keyboard('{Control>}');
    await user.click(screen.getByRole('button', { name: 'Forest' }));
    await user.keyboard('{/Control}');

    await user.click(screen.getByRole('button', { name: 'Remove' }));
    expect(confirm).toHaveBeenCalledWith('Remove 2 cards from this deck?');
    const next = onChange.mock.calls.at(-1)![0] as DeckDocument;
    expect(next.cards).toHaveLength(1);
    expect(next.cards[0]!.name).toBe('Counterspell');
    expect(screen.queryByText(/selected/)).not.toBeInTheDocument();
  });

  it('Clear empties the selection bar', async () => {
    const user = userEvent.setup();
    render(<BrowseShell deck={baseDeck()} onChange={vi.fn()} onBack={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: 'Birds of Paradise' }));
    expect(screen.getByText('1 selected')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.queryByText(/selected/)).not.toBeInTheDocument();
  });

  it('ctrl-click multi-selects cards in aside Maybeboard', async () => {
    const user = userEvent.setup();
    render(<BrowseShell deck={splitMainAsideDeck()} onChange={vi.fn()} onBack={vi.fn()} />);

    const birds = screen.getByRole('button', { name: 'Birds of Paradise' });
    const forest = screen.getByRole('button', { name: 'Forest' });
    const counterspell = screen.getByRole('button', { name: 'Counterspell' });

    await user.click(birds);
    await user.keyboard('{Control>}');
    await user.click(forest);
    await user.keyboard('{/Control}');

    expect(screen.getByText('2 selected')).toBeInTheDocument();
    expect(birds).toHaveClass('is-selected');
    expect(forest).toHaveClass('is-selected');
    expect(counterspell).not.toHaveClass('is-selected');
  });

  it('shift-click ranges across aside Maybeboard cards', async () => {
    const user = userEvent.setup();
    // name_asc: Birds → Counterspell → Forest in Maybeboard
    render(<BrowseShell deck={baseDeck()} onChange={vi.fn()} onBack={vi.fn()} />);

    const birds = screen.getByRole('button', { name: 'Birds of Paradise' });
    const forest = screen.getByRole('button', { name: 'Forest' });
    const counterspell = screen.getByRole('button', { name: 'Counterspell' });

    await user.click(birds);
    await user.keyboard('{Shift>}');
    await user.click(forest);
    await user.keyboard('{/Shift}');

    expect(screen.getByText('3 selected')).toBeInTheDocument();
    expect(birds).toHaveClass('is-selected');
    expect(counterspell).toHaveClass('is-selected');
    expect(forest).toHaveClass('is-selected');
  });
});
