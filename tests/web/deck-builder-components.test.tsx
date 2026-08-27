import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import type { CardInstance, DeckDocument, DeckSummary } from '@rayenz-hub/shared';
import { moveCardCategory, syncCardsWithFormalSwaps } from '@rayenz-hub/shared';
import { LibraryView } from '../../packages/web/src/deck-builder/library/LibraryView';
import { FormatBadge } from '../../packages/web/src/deck-builder/ui/FormatBadge';
import { DbMenu, DbMenuItem } from '../../packages/web/src/deck-builder/ui/DbMenu';
import { ExportBar } from '../../packages/web/src/deck-builder/import-export/ExportBar';
import {
  SetFilterMenu,
  SetFilterMenuControl,
  useSetMembershipFilter,
} from '../../packages/web/src/deck-builder/ui/SetFilterControl';
import { MoveSheet } from '../../packages/web/src/deck-builder/edit/MoveSheet';
import { SwapQueuePanel } from '../../packages/web/src/deck-builder/swaps/SwapQueuePanel';
import { draftFromFormalEntry } from '../../packages/web/src/deck-builder/swaps/swap-edit-chrome';
import { BrowseShell } from '../../packages/web/src/deck-builder/browse/BrowseShell';
import { CategoryBrowse } from '../../packages/web/src/deck-builder/browse/CategoryBrowse';
import commanderFixture from '../fixtures/deck-builder/commander-slice.json';

const mockFetchInSetMembership = vi.hoisted(() => vi.fn());
const mockFetchSyntaxMembership = vi.hoisted(() => vi.fn());

vi.mock('@rayenz-hub/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@rayenz-hub/shared')>();
  return {
    ...actual,
    fetchInSetMembership: (...args: unknown[]) => mockFetchInSetMembership(...args),
    fetchSyntaxMembership: (...args: unknown[]) => mockFetchSyntaxMembership(...args),
  };
});

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

const commanderDoc = commanderFixture as DeckDocument;

const noop = () => {};

async function openFilters(user: ReturnType<typeof userEvent.setup>) {
  const btn = screen.getByRole('button', { name: /^Filters/ });
  if (btn.getAttribute('aria-expanded') !== 'true') {
    await user.click(btn);
  }
}

async function enterTrim(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Deck actions' }));
  await user.click(screen.getByRole('menuitem', { name: 'Trim' }));
}

afterEach(() => {
  cleanup();
  localStorage.removeItem('rayenzHubPickerCardSize');
  mockFetchInSetMembership.mockReset();
  mockFetchSyntaxMembership.mockReset();
});

describe('FormatBadge', () => {
  it.each([
    ['commander', 'Commander'],
    ['cube', 'Cube'],
    ['pendragon', 'Pendragon'],
    ['other', 'Other'],
  ] as const)('renders %s label', (format, label) => {
    render(<FormatBadge format={format} showLabel />);
    expect(screen.getByLabelText(label)).toBeInTheDocument();
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});

describe('DbMenu', () => {
  it('opens menu and selects an item', async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();

    render(
      <DbMenu label="Browse" value="Categories">
        <DbMenuItem active onSelect={onSelect}>
          Categories
        </DbMenuItem>
        <DbMenuItem onSelect={vi.fn()}>Colour identity</DbMenuItem>
      </DbMenu>,
    );

    const trigger = screen.getByRole('button', { name: /Browse/i });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('menu')).toBeInTheDocument();

    await user.click(screen.getByRole('menuitem', { name: 'Categories' }));
    expect(onSelect).toHaveBeenCalled();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();
    render(
      <DbMenu label="Layout" value="Stacked">
        <DbMenuItem active>Stacked</DbMenuItem>
      </DbMenu>,
    );

    await user.click(screen.getByRole('button', { name: /Layout/i }));
    expect(screen.getByRole('menu')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});

describe('LibraryView', () => {
  const summary = (over: Partial<DeckSummary> & Pick<DeckSummary, 'deckId' | 'name' | 'format'>): DeckSummary => ({
    deckId: over.deckId,
    name: over.name,
    format: over.format,
    updatedAt: over.updatedAt ?? '2026-01-01T00:00:00.000Z',
    coverImageUrl: over.coverImageUrl ?? null,
    coverImageUrlSecondary: over.coverImageUrlSecondary ?? null,
    coverPartnerStatus: over.coverPartnerStatus ?? null,
    coverCardName: over.coverCardName ?? null,
  });

  it('renders loading and error states', () => {
    const { rerender } = render(
      <LibraryView
        decks={[]}
        loading
        error={null}
        onOpen={noop}
        onAdd={noop}
        onDelete={noop}
      />,
    );
    expect(screen.getByLabelText(/loading library/i)).toBeInTheDocument();

    rerender(
      <LibraryView
        decks={[]}
        loading={false}
        error="Load failed"
        onOpen={noop}
        onAdd={noop}
        onDelete={noop}
      />,
    );
    expect(screen.getByText('Load failed')).toBeInTheDocument();
    expect(screen.queryByLabelText(/loading library/i)).not.toBeInTheDocument();
  });

  it('renders empty state and sync button when provided', async () => {
    const onAdd = vi.fn();
    const onRefreshRemote = vi.fn();
    const user = userEvent.setup();

    render(
      <LibraryView
        decks={[]}
        loading={false}
        onOpen={noop}
        onAdd={onAdd}
        onDelete={noop}
        onRefreshRemote={onRefreshRemote}
      />,
    );

    expect(screen.getByText('No Hub-saved decks yet.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Sync from API' }));
    expect(onRefreshRemote).toHaveBeenCalled();
    await user.click(screen.getAllByRole('button', { name: 'Add deck' })[1]!);
    expect(onAdd).toHaveBeenCalled();
  });

  it('renders partner cover tiles and delete control', async () => {
    const onOpen = vi.fn();
    const onDelete = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();

    render(
      <LibraryView
        decks={[
          summary({
            deckId: 'p1',
            name: 'Partners',
            format: 'commander',
            coverImageUrl: 'https://example.com/a.jpg',
            coverImageUrlSecondary: 'https://example.com/b.jpg',
            coverPartnerStatus: 'illegal',
          }),
        ]}
        onOpen={onOpen}
        onAdd={noop}
        onDelete={onDelete}
      />,
    );

    const tile = screen.getByText('Partners', { selector: '.db-library-tile-name' }).closest('li')!;
    const openLink = within(tile).getByRole('link');
    expect(openLink).toHaveAttribute('title', expect.stringMatching(/partner/i));
    await user.click(openLink);
    expect(onOpen).toHaveBeenCalledWith('p1');

    await user.click(screen.getByRole('button', { name: 'Delete Partners' }));
    expect(onDelete).toHaveBeenCalledWith('p1');
  });

  it('sorts commander decks by recent vs A–Z vs highlighted card', async () => {
    localStorage.removeItem('rayenz-deck-builder-library-sort');
    const user = userEvent.setup();
    const decks = [
      summary({
        deckId: 'zebra',
        name: 'Zebra',
        format: 'commander',
        updatedAt: '2026-06-01T00:00:00.000Z',
        coverCardName: 'Sol Ring',
      }),
      summary({
        deckId: 'alpha',
        name: 'Alpha',
        format: 'commander',
        updatedAt: '2026-01-01T00:00:00.000Z',
        coverCardName: 'Zetalpa, Primal Dawn',
      }),
    ];

    render(
      <LibraryView decks={decks} onOpen={noop} onAdd={noop} onDelete={noop} />,
    );

    const names = () =>
      [...document.querySelectorAll('.db-library-section[aria-label="Commander"] .db-library-tile-name')].map(
        (el) => el.textContent,
      );

    expect(names()).toEqual(['Zebra', 'Alpha']);

    await user.selectOptions(screen.getByLabelText('Library sort'), 'name');
    expect(names()).toEqual(['Alpha', 'Zebra']);
    expect(localStorage.getItem('rayenz-deck-builder-library-sort')).toBe('name');

    await user.selectOptions(screen.getByLabelText('Library sort'), 'cover');
    expect(names()).toEqual(['Zebra', 'Alpha']);
    expect(localStorage.getItem('rayenz-deck-builder-library-sort')).toBe('cover');
  });
});

describe('ExportBar', () => {
  it('changes browse view and layout via menus', async () => {
    const onViewChange = vi.fn();
    const onLayoutChange = vi.fn();
    const user = userEvent.setup();

    render(
      <ExportBar
        view="category"
        onViewChange={onViewChange}
        layout="stacked"
        onLayoutChange={onLayoutChange}
        cardSort="name_asc"
        onCardSortChange={vi.fn()}
        cardSize="M"
        onCardSizeChange={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Browse/i }));
    await user.click(screen.getByRole('menuitem', { name: 'Colour identity' }));
    expect(onViewChange).toHaveBeenCalledWith('colour_identity');

    await user.click(screen.getByRole('button', { name: /Layout/i }));
    await user.click(screen.getByRole('menuitem', { name: 'Grid' }));
    expect(onLayoutChange).toHaveBeenCalledWith('grid');
  });
});

describe('SetFilterMenuControl', () => {
  it('applies on Enter, shows exclude/error/loading, and clears', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    const onClear = vi.fn();
    const onChange = vi.fn();
    const onExcludeChange = vi.fn();
    const { rerender } = render(
      <SetFilterMenuControl
        value="mh3"
        onChange={onChange}
        onApply={onApply}
        onClear={onClear}
        loading
        error="nope"
        showExclude
        excludeValue="lea"
        onExcludeChange={onExcludeChange}
      />,
    );
    expect(screen.getByRole('button', { name: 'Loading…' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('nope');

    rerender(
      <SetFilterMenuControl
        value="mh3"
        onChange={onChange}
        onApply={onApply}
        onClear={onClear}
        showExclude
        excludeValue="lea"
        onExcludeChange={onExcludeChange}
      />,
    );
    await user.type(screen.getByLabelText('Include set codes'), 'x{Enter}');
    expect(onChange).toHaveBeenCalled();
    expect(onApply).toHaveBeenCalled();
    await user.type(screen.getByLabelText('Exclude set codes'), '{Enter}');
    expect(onApply).toHaveBeenCalledTimes(2);
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(onClear).toHaveBeenCalled();
  });

  it('uses set-code labels when exclude is hidden', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    render(
      <SetFilterMenuControl
        value=""
        onChange={vi.fn()}
        onApply={onApply}
        onClear={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('Set codes')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Set codes'), '{Enter}');
    expect(onApply).toHaveBeenCalled();
  });

  it('wires SetFilterMenu aria from applied include/exclude codes', async () => {
    const user = userEvent.setup();
    render(
      <SetFilterMenu
        showExclude
        filter={{
          setCodesInput: 'mh3',
          setSetCodesInput: vi.fn(),
          appliedCodes: ['MH3'],
          membership: new Set(['ponder']),
          excludeCodesInput: 'lea',
          setExcludeCodesInput: vi.fn(),
          appliedExcludeCodes: ['LEA'],
          excludeMembership: new Set(['black lotus']),
          loading: false,
          error: '',
          apply: vi.fn(),
          clear: vi.fn(),
          label: 'MH3 −LEA',
          active: true,
        }}
      />,
    );
    expect(screen.getByRole('button', { name: /Set filter: MH3; exclude LEA/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Set filter/i }));
    expect(screen.getByLabelText('Include set codes')).toBeInTheDocument();
  });

  it('shows loading value and a bare Set filter aria label', () => {
    render(
      <SetFilterMenu
        filter={{
          setCodesInput: '',
          setSetCodesInput: vi.fn(),
          appliedCodes: [],
          membership: null,
          excludeCodesInput: '',
          setExcludeCodesInput: vi.fn(),
          appliedExcludeCodes: [],
          excludeMembership: null,
          loading: true,
          error: '',
          apply: vi.fn(),
          clear: vi.fn(),
          label: 'All',
          active: false,
        }}
      />,
    );
    expect(screen.getByRole('button', { name: 'Set filter' })).toHaveTextContent('…');
  });
});

function SetFilterProbe() {
  const filter = useSetMembershipFilter();
  return (
    <div>
      <button type="button" onClick={() => void filter.apply('')}>
        empty-apply
      </button>
      <button type="button" onClick={() => void filter.apply('mh3')}>
        include-apply
      </button>
      <button type="button" onClick={() => void filter.apply(undefined, 'lea')}>
        exclude-apply
      </button>
      <button type="button" onClick={() => void filter.apply('mh3', 'lea')}>
        both-apply
      </button>
      <button type="button" onClick={filter.clear}>
        clear-filter
      </button>
      <span data-testid="set-label">{filter.label}</span>
      <span data-testid="set-error">{filter.error}</span>
      <span data-testid="set-active">{String(filter.active)}</span>
    </div>
  );
}

describe('useSetMembershipFilter', () => {
  it('clears on empty apply, loads include sets, and reports fetch errors', async () => {
    const user = userEvent.setup();
    mockFetchInSetMembership.mockResolvedValueOnce(new Set(['ponder']));
    render(<SetFilterProbe />);
    await user.click(screen.getByRole('button', { name: 'empty-apply' }));
    expect(screen.getByTestId('set-label')).toHaveTextContent('All');

    await user.click(screen.getByRole('button', { name: 'include-apply' }));
    await waitFor(() => expect(screen.getByTestId('set-label')).toHaveTextContent('MH3'));
    expect(screen.getByTestId('set-active')).toHaveTextContent('true');

    mockFetchInSetMembership.mockRejectedValueOnce(new Error('scryfall down'));
    await user.click(screen.getByRole('button', { name: 'include-apply' }));
    await waitFor(() => expect(screen.getByTestId('set-error')).toHaveTextContent('scryfall down'));

    mockFetchInSetMembership.mockRejectedValueOnce('nope');
    await user.click(screen.getByRole('button', { name: 'exclude-apply' }));
    await waitFor(() => expect(screen.getByTestId('set-error')).toHaveTextContent('nope'));

    await user.click(screen.getByRole('button', { name: 'clear-filter' }));
    expect(screen.getByTestId('set-label')).toHaveTextContent('All');
    expect(screen.getByTestId('set-active')).toHaveTextContent('false');

    mockFetchInSetMembership.mockResolvedValueOnce(new Set(['black lotus']));
    await user.click(screen.getByRole('button', { name: 'exclude-apply' }));
    await waitFor(() => expect(screen.getByTestId('set-label')).toHaveTextContent('−LEA'));

    mockFetchInSetMembership.mockResolvedValue(new Set(['ponder']));
    await user.click(screen.getByRole('button', { name: 'both-apply' }));
    await waitFor(() => expect(screen.getByTestId('set-label')).toHaveTextContent('MH3 −LEA'));
  });

  it('ignores stale membership responses', async () => {
    const user = userEvent.setup();
    let resolveFirst: ((value: Set<string>) => void) | undefined;
    mockFetchInSetMembership
      .mockImplementationOnce(() => new Promise<Set<string>>((resolve) => {
        resolveFirst = resolve;
      }))
      .mockResolvedValueOnce(new Set(['second']));
    render(<SetFilterProbe />);
    await user.click(screen.getByRole('button', { name: 'include-apply' }));
    await user.click(screen.getByRole('button', { name: 'include-apply' }));
    await waitFor(() => expect(screen.getByTestId('set-label')).toHaveTextContent('MH3'));
    resolveFirst?.(new Set(['first']));
    await Promise.resolve();
    expect(screen.getByTestId('set-label')).toHaveTextContent('MH3');
  });

  it('ignores stale membership errors', async () => {
    const user = userEvent.setup();
    let rejectFirst: ((reason: Error) => void) | undefined;
    mockFetchInSetMembership
      .mockImplementationOnce(() => new Promise<Set<string>>((_, reject) => {
        rejectFirst = reject;
      }))
      .mockRejectedValueOnce(new Error('second'));
    render(<SetFilterProbe />);
    await user.click(screen.getByRole('button', { name: 'include-apply' }));
    await user.click(screen.getByRole('button', { name: 'include-apply' }));
    await waitFor(() => expect(screen.getByTestId('set-error')).toHaveTextContent('second'));
    rejectFirst?.(new Error('first'));
    await Promise.resolve();
    expect(screen.getByTestId('set-error')).toHaveTextContent('second');
  });
});

describe('BrowseShell selection and context menu', () => {
  function foilDeck(): DeckDocument {
    const card = {
      ...(commanderDoc.cards[0] as CardInstance),
      scryfallId: 'foil-shell-id',
      foil: false,
      layout: 'normal',
    };
    return {
      ...commanderDoc,
      cardLayoutDefault: 'grid',
      cards: [card, ...commanderDoc.cards.slice(1)],
      oracle: {
        'id:foil-shell-id': {
          scryfallId: 'foil-shell-id',
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
      },
    };
  }

  it('shows deck title in leaders band and opens add-card FAB', async () => {
    const user = userEvent.setup();
    render(<BrowseShell deck={foilDeck()} onChange={noop} onBack={noop} />);

    expect(screen.getByText(foilDeck().name)).toBeInTheDocument();
    expect(document.querySelector('.db-deck-leaders-identity')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add card…' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add card' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('shows foil toggle without card name and opens context menu actions', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const deck = foilDeck();
    const card = deck.cards[0]!;

    render(<BrowseShell deck={deck} onChange={onChange} onBack={noop} />);

    const tile = screen.getByRole('button', { name: new RegExp(card.name, 'i') });
    await user.click(tile);

    expect(screen.queryByText(card.name, { selector: '.db-selection-bar span' })).not.toBeInTheDocument();
    const foilBtn = screen.getByRole('button', { name: /^(Not foil|Foil)$/i });
    expect(foilBtn).toBeEnabled();
    await user.click(foilBtn);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        cards: expect.arrayContaining([
          expect.objectContaining({ instanceId: card.instanceId, foil: true }),
        ]),
      }),
    );

    fireEvent.contextMenu(tile);
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Mark as foil|Unmark foil/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Mark as proxy|Unmark proxy/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Move…' })).toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: 'Move…' }));
    expect(screen.getByRole('dialog', { name: 'Move card' })).toBeInTheDocument();
  });

  it('long-press on a card opens the context menu on touch', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const deck = foilDeck();
    const card = deck.cards[0]!;

    render(<BrowseShell deck={deck} onChange={noop} onBack={noop} />);

    const tile = screen.getByRole('button', { name: new RegExp(card.name, 'i') });
    fireEvent.pointerDown(tile, {
      button: 0,
      pointerType: 'touch',
      pointerId: 1,
      clientX: 120,
      clientY: 80,
    });
    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Move…' })).toBeInTheDocument();
    vi.useRealTimers();
  });

  it('suppresses click after long-press on a card tile', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const deck = foilDeck();
    const card = deck.cards[0]!;

    render(<BrowseShell deck={deck} onChange={noop} onBack={noop} />);

    const tile = screen.getByRole('button', { name: new RegExp(card.name, 'i') });
    fireEvent.pointerDown(tile, {
      button: 0,
      pointerType: 'touch',
      pointerId: 1,
      clientX: 120,
      clientY: 80,
    });
    await act(async () => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByRole('menu')).toBeInTheDocument();

    fireEvent.pointerUp(tile, { button: 0, pointerType: 'touch', pointerId: 1 });
    await user.click(tile);
    expect(screen.queryByText('1 selected')).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it('toggles proxy from the selection bar', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const deck = foilDeck();
    const card = deck.cards[0]!;

    render(<BrowseShell deck={deck} onChange={onChange} onBack={noop} />);

    await user.click(screen.getByRole('button', { name: new RegExp(card.name, 'i') }));
    await user.click(screen.getByRole('button', { name: /^(Not proxy|Proxy)$/i }));
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        cards: expect.arrayContaining([
          expect.objectContaining({ instanceId: card.instanceId, proxy: true }),
        ]),
      }),
    );
  });

  it('hides proxied cards when the Proxy filter is Hide', async () => {
    const user = userEvent.setup();
    const deck = foilDeck();
    const proxied = {
      ...deck.cards[0]!,
      instanceId: 'proxy-card',
      name: 'Proxy Bird',
      proxy: true,
      foil: false,
    };
    const normal = { ...deck.cards[1]!, proxy: false, foil: false };
    render(
      <BrowseShell
        deck={{ ...deck, cards: [proxied, normal] }}
        onChange={noop}
        onBack={noop}
      />,
    );

    expect(screen.getByRole('button', { name: /Proxy Bird/i })).toBeInTheDocument();
    await openFilters(user);
    const proxy = screen.getByRole('group', { name: 'Proxy filter' });
    await user.click(within(proxy).getByRole('radio', { name: 'Hide' }));
    expect(screen.queryByRole('button', { name: /Proxy Bird/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: new RegExp(normal.name, 'i') })).toBeInTheDocument();

    await openFilters(user);
    await user.click(within(screen.getByRole('group', { name: 'Proxy filter' })).getByRole('radio', { name: 'Only' }));
    expect(screen.getByRole('button', { name: /Proxy Bird/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: new RegExp(`^${normal.name}$`, 'i') })).not.toBeInTheDocument();
  });

  it('shows a dismissible chip for an active proxy filter', async () => {
    const user = userEvent.setup();
    const deck = foilDeck();
    const proxied = {
      ...deck.cards[0]!,
      instanceId: 'proxy-card',
      name: 'Proxy Bird',
      proxy: true,
      foil: false,
    };
    const normal = { ...deck.cards[1]!, proxy: false, foil: false };
    render(
      <BrowseShell
        deck={{ ...deck, cards: [proxied, normal] }}
        onChange={noop}
        onBack={noop}
      />,
    );

    await openFilters(user);
    await user.click(within(screen.getByRole('group', { name: 'Proxy filter' })).getByRole('radio', { name: 'Hide' }));
    expect(screen.queryByRole('button', { name: /Proxy Bird/i })).not.toBeInTheDocument();

    const chip = screen.getByRole('button', { name: 'Remove filter: Proxy Hide' });
    expect(chip).toBeInTheDocument();
    await user.click(chip);
    expect(screen.getByRole('button', { name: /Proxy Bird/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove filter: Proxy Hide' })).not.toBeInTheDocument();
  });

  it('hides foiled cards when the Foil filter is Hide', async () => {
    const user = userEvent.setup();
    const deck = foilDeck();
    const foiled = {
      ...deck.cards[0]!,
      instanceId: 'foil-card',
      name: 'Foil Bird',
      proxy: false,
      foil: true,
    };
    const normal = { ...deck.cards[1]!, proxy: false, foil: false };
    render(
      <BrowseShell
        deck={{ ...deck, cards: [foiled, normal] }}
        onChange={noop}
        onBack={noop}
      />,
    );

    expect(screen.getByRole('button', { name: /Foil Bird/i })).toBeInTheDocument();
    await openFilters(user);
    const foil = screen.getByRole('group', { name: 'Foil filter' });
    await user.click(within(foil).getByRole('radio', { name: 'Hide' }));
    expect(screen.queryByRole('button', { name: /Foil Bird/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: new RegExp(normal.name, 'i') })).toBeInTheDocument();

    await openFilters(user);
    await user.click(
      within(screen.getByRole('group', { name: 'Foil filter' })).getByRole('radio', { name: 'Only' }),
    );
    expect(screen.getByRole('button', { name: /Foil Bird/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: new RegExp(`^${normal.name}$`, 'i') })).not.toBeInTheDocument();

    await openFilters(user);
    await user.click(
      within(screen.getByRole('group', { name: 'Foil filter' })).getByRole('radio', { name: 'All' }),
    );
    expect(screen.getByRole('button', { name: /Foil Bird/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: new RegExp(normal.name, 'i') })).toBeInTheDocument();
  });

  it('filters browse cards by Scryfall syntax membership and Clear restores them', async () => {
    const user = userEvent.setup();
    const deck = foilDeck();
    const keep = { ...deck.cards[0]!, instanceId: 'keep', name: 'Ponder', proxy: false, foil: false };
    const drop = { ...deck.cards[1]!, instanceId: 'drop', name: 'Sol Ring', proxy: false, foil: false };
    mockFetchSyntaxMembership.mockResolvedValue(new Set(['ponder']));
    render(
      <BrowseShell
        deck={{ ...deck, cards: [keep, drop] }}
        onChange={noop}
        onBack={noop}
      />,
    );

    expect(screen.getByRole('button', { name: /Ponder/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Sol Ring/i })).toBeInTheDocument();

    await openFilters(user);
    await user.type(screen.getByLabelText('Scryfall syntax'), 't:instant');
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    await waitFor(() => {
      expect(mockFetchSyntaxMembership).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /Sol Ring/i })).not.toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /Ponder/i })).toBeInTheDocument();

    await openFilters(user);
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(screen.getByRole('button', { name: /Sol Ring/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Ponder/i })).toBeInTheDocument();
  });

  it('adds the selected card to the swap queue from the context menu', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const deck = foilDeck();
    const card = deck.cards[0]!;
    const expectedCategory = card.primaryCategory;

    render(<BrowseShell deck={deck} onChange={onChange} onBack={noop} />);

    const tile = screen.getByRole('button', { name: new RegExp(card.name, 'i') });
    fireEvent.contextMenu(tile);
    await user.click(screen.getByRole('menuitem', { name: 'Add to swap queue' }));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        formalSwapEntries: [
          expect.objectContaining({
            inInstanceId: null,
            outInstanceId: card.instanceId,
            inTargetCategory: expectedCategory,
            sortIndex: 0,
          }),
        ],
        cards: expect.arrayContaining([
          expect.objectContaining({
            instanceId: card.instanceId,
            primaryCategory: 'Queued Out',
          }),
        ]),
      }),
    );
  });
});

describe('CategoryBrowse swap-In ghosts', () => {
  it('marks formal Ins as ghosts and sorts them after permanent cards', () => {
    const creatureA = {
      ...(commanderDoc.cards[0] as CardInstance),
      instanceId: 'ghost-1',
      name: 'Alpha Ghost',
      primaryCategory: 'Creature',
      categories: ['Creature'],
    };
    const creatureB = {
      ...(commanderDoc.cards[0] as CardInstance),
      instanceId: 'perm-1',
      name: 'Zebra Beast',
      primaryCategory: 'Creature',
      categories: ['Creature'],
    };
    const synced = syncCardsWithFormalSwaps(
      {
        ...commanderDoc,
        cardLayoutDefault: 'grid',
        cards: [creatureA, creatureB, ...commanderDoc.cards.slice(1)],
      },
      [
        {
          id: 's1',
          inInstanceId: 'ghost-1',
          outInstanceId: null,
          inTargetCategory: 'Creature',
          sortIndex: 0,
          notes: null,
        },
      ],
    );

    const { container } = render(
      <CategoryBrowse deck={synced} layout="grid" cardSort="name_asc" />,
    );

    const ghost = screen.getByRole('button', { name: /Alpha Ghost, swap in/i });
    expect(ghost).toHaveClass('is-swap-in-ghost');

    const creatureSection = Array.from(
      container.querySelectorAll('.db-section, .db-cat-column'),
    ).find((el) => el.textContent?.includes('Creature'));
    expect(creatureSection).toBeTruthy();
    const tiles = within(creatureSection as HTMLElement).getAllByRole('button');
    const names = tiles.map((t) => t.getAttribute('aria-label') || '');
    // A–Z alone would put Alpha before Zebra; ghost partition puts permanent Zebra first.
    const permIdx = names.findIndex((n) => n.includes('Zebra Beast'));
    const ghostIdx = names.findIndex((n) => n.includes('Alpha Ghost'));
    expect(permIdx).toBeGreaterThanOrEqual(0);
    expect(ghostIdx).toBeGreaterThan(permIdx);
  });

  it('ghosts same-name reprint Ins in the target category', () => {
    const outPrint = {
      ...(commanderDoc.cards[0] as CardInstance),
      instanceId: 'sol-out',
      name: 'Sol Ring',
      setCode: 'cma',
      collectorNumber: '1',
      scryfallId: 'sf-sol-old',
      primaryCategory: 'Other',
      categories: ['Other'],
    };
    const inPrint = {
      ...(commanderDoc.cards[0] as CardInstance),
      instanceId: 'sol-in',
      name: 'Sol Ring',
      setCode: 'sld',
      collectorNumber: '2683',
      scryfallId: 'sf-sol-new',
      primaryCategory: 'Other',
      categories: ['Other'],
    };
    const synced = syncCardsWithFormalSwaps(
      {
        ...commanderDoc,
        cardLayoutDefault: 'grid',
        cards: [outPrint, inPrint, ...commanderDoc.cards.slice(1)],
      },
      [
        {
          id: 's-reprint',
          inInstanceId: 'sol-in',
          outInstanceId: 'sol-out',
          inTargetCategory: 'Other',
          sortIndex: 0,
          notes: null,
        },
      ],
    );

    const { container } = render(
      <CategoryBrowse deck={synced} layout="grid" cardSort="name_asc" />,
    );

    const ghosts = screen.getAllByRole('button', { name: /Sol Ring, swap in/i });
    expect(ghosts).toHaveLength(1);
    expect(ghosts[0]).toHaveClass('is-swap-in-ghost');

    const otherSection = Array.from(
      container.querySelectorAll('.db-section, .db-cat-column'),
    ).find((el) => el.textContent?.includes('Other'));
    expect(otherSection).toBeTruthy();
    expect(
      within(otherSection as HTMLElement).getByRole('button', { name: /Sol Ring, swap in/i }),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Sol Ring$/i })).toBeNull();
  });
});

describe('BrowseShell trim mode', () => {
  function trimDeck(overrides: Partial<DeckDocument> = {}): DeckDocument {
    return {
      ...commanderDoc,
      cardLayoutDefault: 'grid',
      ...overrides,
    };
  }

  it('pins browse chrome while the body scrolls', () => {
    const { container } = render(<BrowseShell deck={trimDeck()} onChange={noop} onBack={noop} />);
    expect(container.querySelector('.hub-sticky-chrome')).toBeTruthy();
    expect(container.querySelector('#db-progress-host')).toBeTruthy();
  });

  it('moves overflow actions into the deck menu', async () => {
    const user = userEvent.setup();
    render(<BrowseShell deck={trimDeck()} onChange={noop} onBack={noop} />);
    expect(screen.queryByRole('button', { name: 'Trim' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Categories…' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Deck actions' }));
    expect(screen.getByRole('menuitem', { name: 'Trim' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Categories…' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Basics…' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Generate glance' })).toBeInTheDocument();
  });

  it('moves a clicked card to Maybeboard', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const deck = trimDeck();
    const card = deck.cards[0]!;

    render(<BrowseShell deck={deck} onChange={onChange} onBack={noop} />);
    await enterTrim(user);
    await user.click(screen.getByRole('button', { name: new RegExp(`^${card.name}$`, 'i') }));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        cards: expect.arrayContaining([
          expect.objectContaining({ instanceId: card.instanceId, primaryCategory: 'Maybeboard' }),
        ]),
      }),
    );
  });

  it('deletes a clicked card without confirm', async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const onChange = vi.fn();
    const deck = trimDeck();
    const card = deck.cards[0]!;

    render(<BrowseShell deck={deck} onChange={onChange} onBack={noop} />);
    await enterTrim(user);
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(screen.getByRole('button', { name: new RegExp(`^${card.name}$`, 'i') }));

    expect(confirm).not.toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        cards: expect.not.arrayContaining([
          expect.objectContaining({ instanceId: card.instanceId }),
        ]),
      }),
    );
    confirm.mockRestore();
  });

  it('does not move a card that is already Maybeboard', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const mbCard = {
      ...(commanderDoc.cards[0] as CardInstance),
      instanceId: 'mb-1',
      name: 'Stash Me',
      primaryCategory: 'Maybeboard',
      categories: ['Maybeboard'],
    };
    const deck = trimDeck({
      cards: [mbCard, ...commanderDoc.cards],
      categories: [
        ...(commanderDoc.categories || []),
        { name: 'Maybeboard', includedInDeck: false, includedInPrice: false },
      ],
    });

    render(<BrowseShell deck={deck} onChange={onChange} onBack={noop} />);
    await enterTrim(user);
    await user.click(screen.getByRole('button', { name: /^Stash Me$/i }));

    expect(onChange).not.toHaveBeenCalled();
  });

  it('exits on Escape and returns to selection', async () => {
    const user = userEvent.setup();
    const deck = trimDeck();
    const card = deck.cards[0]!;

    render(<BrowseShell deck={deck} onChange={noop} onBack={noop} />);
    await enterTrim(user);
    expect(screen.getByText(/Trim mode — click a card to move it to Maybeboard/i)).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByText(/Trim mode — click a card to move it to Maybeboard/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Deck actions' }));
    expect(screen.getByRole('menuitem', { name: 'Trim' })).toBeInTheDocument();
    await user.keyboard('{Escape}');

    await user.click(screen.getByRole('button', { name: new RegExp(`^${card.name}$`, 'i') }));
    expect(screen.getByText('1 selected')).toBeInTheDocument();
  });

  it('hides Trim when read-only', () => {
    render(<BrowseShell deck={trimDeck()} onChange={noop} onBack={noop} readOnly />);
    expect(screen.queryByRole('button', { name: 'Deck actions' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Trim' })).not.toBeInTheDocument();
  });

  it('toggles Trim with T and shows a shortcut hint', async () => {
    const user = userEvent.setup();
    render(<BrowseShell deck={trimDeck()} onChange={noop} onBack={noop} />);
    await user.keyboard('t');
    expect(screen.getByText(/Trim mode — click a card to move it to Maybeboard/i)).toBeInTheDocument();
    expect(screen.getByText('Trim mode · Esc exit')).toBeInTheDocument();
    await user.keyboard('t');
    expect(screen.queryByText(/Trim mode — click a card to move it to Maybeboard/i)).not.toBeInTheDocument();
  });

  it('auto-exits trim when size drops from over target to legal', async () => {
    const user = userEvent.setup();
    const base = commanderDoc.cards[0] as CardInstance;
    const bulk: CardInstance = {
      ...base,
      instanceId: 'bulk',
      name: 'Bulk Creatures',
      quantity: 100,
      primaryCategory: 'Creature',
      categories: ['Creature'],
    };
    const extra: CardInstance = {
      ...base,
      instanceId: 'extra',
      name: 'Extra Creature',
      quantity: 1,
      primaryCategory: 'Creature',
      categories: ['Creature'],
    };
    const initial = trimDeck({ cards: [bulk, extra] });

    function Harness() {
      const [deck, setDeck] = useState(initial);
      return <BrowseShell deck={deck} onChange={setDeck} onBack={noop} />;
    }

    render(<Harness />);
    await enterTrim(user);
    expect(screen.getByText(/Trim mode · 1 over/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Extra Creature$/i }));
    await waitFor(() => {
      expect(screen.queryByText(/Trim mode/i)).not.toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: 'Deck actions' }));
    expect(screen.getByRole('menuitem', { name: 'Trim' })).toBeInTheDocument();
  });

  it('allows trim when already at legal size', async () => {
    const user = userEvent.setup();
    const base = commanderDoc.cards[0] as CardInstance;
    const deck = trimDeck({
      cards: [
        {
          ...base,
          instanceId: 'legal',
          name: 'Legal Stack',
          quantity: 100,
          primaryCategory: 'Creature',
          categories: ['Creature'],
        },
      ],
    });

    render(<BrowseShell deck={deck} onChange={noop} onBack={noop} />);
    await enterTrim(user);
    expect(screen.getByText(/Trim mode — click a card to move it to Maybeboard/i)).toBeInTheDocument();
    expect(screen.getByText('Trim mode · Esc exit')).toBeInTheDocument();
  });

  it('removes the selection with Delete after confirm', async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onChange = vi.fn();
    const deck = trimDeck();
    const card = deck.cards[0]!;
    render(<BrowseShell deck={deck} onChange={onChange} onBack={noop} />);
    await user.click(screen.getByRole('button', { name: new RegExp(`^${card.name}$`, 'i') }));
    expect(screen.getByText('Esc clear · Del remove · T trim')).toBeInTheDocument();
    await user.keyboard('{Delete}');
    expect(confirm).toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        cards: expect.not.arrayContaining([
          expect.objectContaining({ instanceId: card.instanceId }),
        ]),
      }),
    );
    confirm.mockRestore();
  });
});

describe('BrowseShell pair deep-link', () => {
  it('opens the named formal pair and offers View in Swap Queue', async () => {
    const cardIn = commanderDoc.cards[0]!;
    const cardOut = commanderDoc.cards[1]!;
    const deck: DeckDocument = {
      ...commanderDoc,
      cardLayoutDefault: 'grid',
      formalSwapEntries: [
        {
          id: 's1',
          inInstanceId: cardIn.instanceId,
          outInstanceId: cardOut.instanceId,
          inTargetCategory: 'Creature',
          sortIndex: 0,
          notes: null,
        },
      ],
    };
    render(
      <BrowseShell deck={deck} onChange={noop} onBack={noop} focusPairEntryId="s1" />,
    );
    expect(await screen.findByRole('dialog', { name: 'Edit swap' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'View in Swap Queue' })).toBeInTheDocument();
  });
});

describe('BrowseShell swap-In ghosts on load', () => {
  function unsyncedGhostDeck(): DeckDocument {
    const ghostIn = {
      ...(commanderDoc.cards[0] as CardInstance),
      instanceId: 'ghost-in',
      name: 'Alpha Ghost',
      primaryCategory: 'Queued In',
      categories: ['Queued In'],
    };
    return {
      ...commanderDoc,
      cardLayoutDefault: 'grid',
      cards: [ghostIn, ...commanderDoc.cards],
      formalSwapEntries: [
        {
          id: 's1',
          inInstanceId: 'ghost-in',
          outInstanceId: null,
          inTargetCategory: 'Creature',
          sortIndex: 0,
          notes: null,
        },
      ],
    };
  }

  it('projects Queued In cards into the target category as ghosts without saving', () => {
    const onChange = vi.fn();
    render(
      <BrowseShell deck={unsyncedGhostDeck()} onChange={onChange} onBack={noop} />,
    );

    const ghost = screen.getByRole('button', { name: /Alpha Ghost, swap in/i });
    expect(ghost).toHaveClass('is-swap-in-ghost');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('projects ghosts on load when read-only', () => {
    const onChange = vi.fn();
    render(
      <BrowseShell
        deck={unsyncedGhostDeck()}
        onChange={onChange}
        onBack={noop}
        readOnly
      />,
    );

    const ghost = screen.getByRole('button', { name: /Alpha Ghost, swap in/i });
    expect(ghost).toHaveClass('is-swap-in-ghost');
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('MoveSheet', () => {
  it('applies category move', async () => {
    const card = commanderDoc.cards[0] as CardInstance;
    const onApply = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();

    render(
      <MoveSheet deck={commanderDoc} cards={[card]} onClose={onClose} onApply={onApply} />,
    );

    expect(screen.getByRole('dialog', { name: 'Move card' })).toBeInTheDocument();
    expect(screen.getByLabelText('Pile name (optional)')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Category'), 'Land');
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({
        cards: moveCardCategory(commanderDoc.cards, card.instanceId, 'Land', card.stack),
      }),
    );
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes without applying', async () => {
    const card = commanderDoc.cards[0] as CardInstance;
    const onApply = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();

    render(
      <MoveSheet deck={commanderDoc} cards={[card]} onClose={onClose} onApply={onApply} />,
    );

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalled();
    expect(onApply).not.toHaveBeenCalled();
  });

  it('moves into a newly typed category name', async () => {
    const card = commanderDoc.cards[0] as CardInstance;
    const onApply = vi.fn();
    const user = userEvent.setup();

    render(
      <MoveSheet deck={commanderDoc} cards={[card]} onClose={vi.fn()} onApply={onApply} />,
    );

    await user.selectOptions(screen.getByLabelText('Category'), '__new__');
    await user.type(screen.getByLabelText('New category name'), 'Ramp');
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    expect(onApply).toHaveBeenCalled();
    const next = onApply.mock.calls[0]![0] as DeckDocument;
    const moved = next.cards.find((c) => c.instanceId === card.instanceId);
    expect(moved?.primaryCategory).toBe('Ramp');
    expect(next.categories.some((c) => c.name === 'Ramp')).toBe(true);
  });

  it('splits category options into Custom then Default', () => {
    const card = commanderDoc.cards[0] as CardInstance;
    const deck: DeckDocument = {
      ...commanderDoc,
      categories: [
        { name: 'Ramp', includedInDeck: true, includedInPrice: true, target: null },
        ...commanderDoc.categories,
      ],
    };

    render(<MoveSheet deck={deck} cards={[card]} onClose={vi.fn()} onApply={vi.fn()} />);

    const select = screen.getByLabelText('Category');
    const groups = within(select).getAllByRole('group');
    expect(groups.map((g) => g.getAttribute('label'))).toEqual(['Custom', 'Default']);
    expect(within(groups[0]!).getByRole('option', { name: 'Ramp' })).toBeInTheDocument();
    expect(within(groups[1]!).getByRole('option', { name: 'Land' })).toBeInTheDocument();
  });
});

describe('SwapQueuePanel', () => {
  const panelProps = {
    onStartEdit: vi.fn(),
    onDraftChange: vi.fn(),
    onConfirmIn: vi.fn(),
    onCancelEdit: vi.fn(),
    onRemoveEdit: vi.fn(),
  };

  it('adds swap entry and shows incomplete warning', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();

    render(
      <SwapQueuePanel
        deck={commanderDoc}
        onChange={onChange}
        draft={null}
        {...panelProps}
      />,
    );

    expect(screen.getByText('No swap pairings yet.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        formalSwapEntries: expect.arrayContaining([
          expect.objectContaining({ inInstanceId: null, outInstanceId: null }),
        ]),
      }),
    );
  });

  it('hides the theory notice for a read-only owned deck', () => {
    const deck: DeckDocument = {
      ...commanderDoc,
      ownership: 'owned',
      formalSwapEntries: [
        {
          id: 'swap-1',
          inInstanceId: commanderDoc.cards[0]!.instanceId,
          outInstanceId: commanderDoc.cards[1]!.instanceId,
          inTargetCategory: 'Creature',
          sortIndex: 0,
          notes: null,
        },
      ],
    };

    render(
      <SwapQueuePanel
        deck={deck}
        onChange={vi.fn()}
        draft={null}
        {...panelProps}
        readOnly
      />,
    );

    expect(screen.queryByText(/Theory deck — swap queue is view-only/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add' })).not.toBeInTheDocument();
    expect(screen.getByTitle('View only')).toBeDisabled();
  });

  it('shows the theory notice for a read-only theory deck', () => {
    const deck: DeckDocument = {
      ...commanderDoc,
      ownership: 'theory',
      formalSwapEntries: [
        {
          id: 'swap-1',
          inInstanceId: commanderDoc.cards[0]!.instanceId,
          outInstanceId: commanderDoc.cards[1]!.instanceId,
          inTargetCategory: 'Creature',
          sortIndex: 0,
          notes: null,
        },
      ],
    };

    render(
      <SwapQueuePanel
        deck={deck}
        onChange={vi.fn()}
        draft={null}
        {...panelProps}
        readOnly
      />,
    );

    expect(screen.getByText(/Theory deck — swap queue is view-only/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add' })).not.toBeInTheDocument();
    expect(screen.getByTitle('Theory deck — view only')).toBeDisabled();
  });

  it('opens edit chrome for an existing entry', async () => {
    const deck: DeckDocument = {
      ...commanderDoc,
      formalSwapEntries: [
        {
          id: 'swap-1',
          inInstanceId: commanderDoc.cards[0]!.instanceId,
          outInstanceId: commanderDoc.cards[1]!.instanceId,
          inTargetCategory: 'Creature',
          sortIndex: 0,
          notes: 'test note',
        },
      ],
    };
    const onStartEdit = vi.fn();
    const user = userEvent.setup();

    render(
      <SwapQueuePanel
        deck={deck}
        onChange={vi.fn()}
        draft={null}
        {...panelProps}
        onStartEdit={onStartEdit}
      />,
    );

    expect(screen.getByText('→ Creature')).toBeInTheDocument();
    await user.click(screen.getByTitle('Click to edit swap'));
    expect(onStartEdit).toHaveBeenCalledWith(deck.formalSwapEntries[0]);
  });

  it('shows View in Swap Queue from the pair editor', async () => {
    const deck: DeckDocument = {
      ...commanderDoc,
      formalSwapEntries: [
        {
          id: 'swap-1',
          inInstanceId: commanderDoc.cards[0]!.instanceId,
          outInstanceId: commanderDoc.cards[1]!.instanceId,
          inTargetCategory: 'Creature',
          sortIndex: 0,
          notes: null,
        },
      ],
    };
    const onView = vi.fn();
    render(
      <SwapQueuePanel
        deck={deck}
        onChange={vi.fn()}
        draft={draftFromFormalEntry(deck.formalSwapEntries[0]!)}
        {...panelProps}
        onViewInSwapQueue={onView}
      />,
    );
    const btn = screen.getByRole('button', { name: 'View in Swap Queue' });
    await userEvent.setup().click(btn);
    expect(onView).toHaveBeenCalled();
  });

  it('keeps a pair when only Out matches set membership and hides non-matching pairs', () => {
    const inCard = commanderDoc.cards[1]!; // Forest — ignored by set membership
    const outCard = commanderDoc.cards[0]!; // Birds of Paradise
    const otherCard = commanderDoc.cards[2]!;
    const deck: DeckDocument = {
      ...commanderDoc,
      formalSwapEntries: [
        {
          id: 'swap-keep',
          inInstanceId: inCard.instanceId,
          outInstanceId: outCard.instanceId,
          inTargetCategory: 'Creature',
          sortIndex: 0,
          notes: null,
        },
        {
          id: 'swap-drop',
          inInstanceId: otherCard.instanceId,
          outInstanceId: null,
          inTargetCategory: 'Instant',
          sortIndex: 1,
          notes: null,
        },
      ],
    };
    const membership = new Set([String(outCard.name).toLowerCase()]);

    render(
      <SwapQueuePanel
        deck={deck}
        onChange={vi.fn()}
        draft={null}
        {...panelProps}
        setMembership={membership}
      />,
    );

    expect(screen.getByText('→ Creature')).toBeInTheDocument();
    expect(screen.queryByText('→ Instant')).not.toBeInTheDocument();
  });

  it('shows set-filter empty hint when no pairs match', () => {
    const deck: DeckDocument = {
      ...commanderDoc,
      formalSwapEntries: [
        {
          id: 'swap-1',
          inInstanceId: commanderDoc.cards[0]!.instanceId,
          outInstanceId: commanderDoc.cards[1]!.instanceId,
          inTargetCategory: 'Creature',
          sortIndex: 0,
          notes: null,
        },
      ],
    };

    render(
      <SwapQueuePanel
        deck={deck}
        onChange={vi.fn()}
        draft={null}
        {...panelProps}
        setMembership={new Set(['not-a-real-card-name'])}
      />,
    );

    expect(screen.getByText('No swap pairings match the set filter.')).toBeInTheDocument();
  });

  it('freezes preview pair tiles to aside size while popout stays at Medium', async () => {
    localStorage.setItem('rayenzHubPickerCardSize', 'L');
    window.dispatchEvent(new CustomEvent('rayenz-hub-card-size', { detail: 'L' }));
    const deck: DeckDocument = {
      ...commanderDoc,
      formalSwapEntries: [
        {
          id: 'swap-1',
          inInstanceId: commanderDoc.cards[0]!.instanceId,
          outInstanceId: commanderDoc.cards[1]!.instanceId,
          inTargetCategory: 'Creature',
          sortIndex: 0,
          notes: null,
        },
      ],
    };
    const user = userEvent.setup();

    render(
      <SwapQueuePanel deck={deck} onChange={vi.fn()} draft={null} {...panelProps} />,
    );

    const panel = document.querySelector('.db-swaps') as HTMLElement;
    expect(panel.style.getPropertyValue('--db-card-w')).toBe('63px');
    expect(panel.style.getPropertyValue('--db-swap-card-w')).toBe('63px');
    expect(document.querySelector('.db-swap-pair-stack.is-preview')).toBeTruthy();

    await user.hover(screen.getByTitle('Click to edit swap'));
    const popout = document.querySelector('.db-swap-pair-popout') as HTMLElement;
    expect(popout).toBeInTheDocument();
    expect(popout.style.getPropertyValue('--db-card-w')).toBe('213px');
  });

  it('shows incomplete warning and hides empty category text', () => {
    const deck: DeckDocument = {
      ...commanderDoc,
      formalSwapEntries: [
        {
          id: 'swap-draft',
          inInstanceId: null,
          outInstanceId: commanderDoc.cards[0]!.instanceId,
          inTargetCategory: null,
          sortIndex: 0,
          notes: null,
        },
      ],
    };

    render(
      <SwapQueuePanel deck={deck} onChange={vi.fn()} draft={null} {...panelProps} />,
    );

    expect(screen.getByText('1 incomplete pairing(s)')).toBeInTheDocument();
    expect(screen.queryByText('→ category?')).not.toBeInTheDocument();
    expect(screen.queryByText(/^→ /)).not.toBeInTheDocument();
  });

  it('shows Medium pop-out on hover for aside mini tiles', async () => {
    const deck: DeckDocument = {
      ...commanderDoc,
      formalSwapEntries: [
        {
          id: 'swap-1',
          inInstanceId: commanderDoc.cards[0]!.instanceId,
          outInstanceId: commanderDoc.cards[1]!.instanceId,
          inTargetCategory: 'Creature',
          sortIndex: 0,
          notes: null,
        },
      ],
    };
    const user = userEvent.setup();

    render(
      <SwapQueuePanel deck={deck} onChange={vi.fn()} draft={null} {...panelProps} />,
    );

    const pair = screen.getByTitle('Click to edit swap');
    expect(document.querySelector('.db-swap-pair-popout')).not.toBeInTheDocument();

    await user.hover(pair);

    const popout = document.querySelector('.db-swap-pair-popout') as HTMLElement;
    expect(popout).toBeInTheDocument();
    expect(popout.querySelector('.db-swap-pair-stack.is-full')).toBeTruthy();
    expect(popout.style.getPropertyValue('--db-card-w')).toBe('213px');
    expect(within(popout).getByText('→ Creature')).toBeInTheDocument();

    await user.unhover(pair);
    expect(document.querySelector('.db-swap-pair-popout')).not.toBeInTheDocument();
  });

  it('renders edit chrome, Out picker, and In search takeover in the same dialog', async () => {
    const foilCard: CardInstance = {
      ...commanderDoc.cards[0]!,
      instanceId: 'foil-1',
      quantity: 2,
      foil: true,
      layout: 'transform',
      scryfallId: 'sf-transform',
    };
    const deck: DeckDocument = {
      ...commanderDoc,
      cards: [...commanderDoc.cards, foilCard],
      formalSwapEntries: [
        {
          id: 'swap-1',
          inInstanceId: foilCard.instanceId,
          outInstanceId: commanderDoc.cards[1]!.instanceId,
          inTargetCategory: 'Creature',
          sortIndex: 0,
          notes: 'note',
        },
      ],
    };
    const draft = {
      entryId: 'swap-1',
      inInstanceId: foilCard.instanceId,
      outInstanceId: commanderDoc.cards[1]!.instanceId,
      inTargetCategory: 'Land',
      notes: 'updated note',
    };
    const onDraftChange = vi.fn();
    const onConfirmIn = vi.fn();
    const onCancelEdit = vi.fn();
    const onRemoveEdit = vi.fn();
    const openPicker = vi.fn();
    (window as Window & { HubCardPicker?: { open: typeof openPicker } }).HubCardPicker = {
      open: openPicker,
    };
    const user = userEvent.setup();

    render(
      <SwapQueuePanel
        deck={deck}
        onChange={vi.fn()}
        draft={draft}
        onStartEdit={vi.fn()}
        onDraftChange={onDraftChange}
        onConfirmIn={onConfirmIn}
        onCancelEdit={onCancelEdit}
        onRemoveEdit={onRemoveEdit}
      />,
    );

    expect(screen.getByRole('dialog', { name: 'Edit swap' })).toBeInTheDocument();
    expect(document.body.querySelectorAll('.db-modal')).toHaveLength(1);
    expect(document.body.querySelector('.db-swap-edit-slots')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Change Out' }));
    expect(openPicker).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Select Out card',
        groupByCategory: true,
        selectedValue: commanderDoc.cards[1]!.instanceId,
      }),
    );
    const pickerItems = openPicker.mock.calls[0]![0]!.items as { value: unknown }[];
    expect(pickerItems.map((i) => i.value)).not.toContain(foilCard.instanceId);
    expect(pickerItems.map((i) => i.value)).toContain(commanderDoc.cards[1]!.instanceId);

    await user.click(screen.getByRole('button', { name: 'Change In' }));
    expect(screen.getByRole('dialog', { name: 'Choose In card from Scryfall' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Choose In card from Scryfall' })).toBeInTheDocument();
    expect(document.body.querySelectorAll('.db-modal')).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByRole('dialog', { name: 'Edit swap' })).toBeInTheDocument();
    // Prior In remains pinned — edit form still has Out/In slots and notes
    expect(document.body.querySelector('.db-swap-edit-slots')).toBeTruthy();
    expect(screen.getByDisplayValue('updated note')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change Out' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Change In' })).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Place In card in category'), 'Land');
    expect(onDraftChange).toHaveBeenCalledWith({ inTargetCategory: 'Land' });

    fireEvent.change(screen.getByDisplayValue('updated note'), { target: { value: 'new notes' } });
    expect(onDraftChange).toHaveBeenCalledWith({ notes: 'new notes' });

    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onCancelEdit).toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Remove' }));
    expect(onRemoveEdit).toHaveBeenCalled();
  });

  it('defaults Place In category from the Out card when picking Out with category unset', async () => {
    const outCard = commanderDoc.cards[1]!;
    const deck: DeckDocument = {
      ...commanderDoc,
      formalSwapEntries: [
        {
          id: 'swap-1',
          inInstanceId: null,
          outInstanceId: null,
          inTargetCategory: null,
          sortIndex: 0,
          notes: null,
        },
      ],
    };
    const draft = {
      entryId: 'swap-1',
      inInstanceId: null,
      outInstanceId: null,
      inTargetCategory: null,
      notes: '',
    };
    const onDraftChange = vi.fn();
    const openPicker = vi.fn();
    (window as Window & { HubCardPicker?: { open: typeof openPicker } }).HubCardPicker = {
      open: openPicker,
    };
    const user = userEvent.setup();

    render(
      <SwapQueuePanel
        deck={deck}
        onChange={vi.fn()}
        draft={draft}
        onStartEdit={vi.fn()}
        onDraftChange={onDraftChange}
        onConfirmIn={vi.fn()}
        onCancelEdit={vi.fn()}
        onRemoveEdit={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Choose Out' }));
    expect(openPicker).toHaveBeenCalled();
    const onPick = openPicker.mock.calls[0]![0]!.onPick as (value: unknown) => void;
    onPick(outCard.instanceId);

    expect(onDraftChange).toHaveBeenCalledWith({
      outInstanceId: outCard.instanceId,
      inTargetCategory: outCard.primaryCategory,
    });
  });

  it('closes edit chrome on backdrop click, not on card click', () => {
    const deck: DeckDocument = {
      ...commanderDoc,
      formalSwapEntries: [
        {
          id: 'swap-1',
          inInstanceId: commanderDoc.cards[0]!.instanceId,
          outInstanceId: commanderDoc.cards[1]!.instanceId,
          inTargetCategory: 'Creature',
          sortIndex: 0,
          notes: null,
        },
      ],
    };
    const draft = {
      entryId: 'swap-1',
      inInstanceId: commanderDoc.cards[0]!.instanceId,
      outInstanceId: commanderDoc.cards[1]!.instanceId,
      inTargetCategory: 'Creature',
      notes: '',
    };
    const onCancelEdit = vi.fn();

    render(
      <SwapQueuePanel
        deck={deck}
        onChange={vi.fn()}
        draft={draft}
        onStartEdit={vi.fn()}
        onDraftChange={vi.fn()}
        onConfirmIn={vi.fn()}
        onCancelEdit={onCancelEdit}
        onRemoveEdit={vi.fn()}
        onFinalizeEdit={vi.fn()}
      />,
    );

    const closeBtn = screen.getByRole('button', { name: 'Close' });
    const finalizeBtn = screen.getByRole('button', { name: 'Finalize' });
    expect(closeBtn.classList.contains('is-active')).toBe(true);
    expect(finalizeBtn.classList.contains('is-active')).toBe(false);

    fireEvent.click(screen.getByTestId('swap-queue-edit'));
    expect(onCancelEdit).not.toHaveBeenCalled();

    fireEvent.click(document.body.querySelector('.db-modal')!);
    expect(onCancelEdit).toHaveBeenCalledTimes(1);
  });
});
