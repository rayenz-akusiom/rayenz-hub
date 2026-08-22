import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  emptyCardOracle,
  oracleKey,
  type CardInstance,
  type DeckDocument,
  type ScryfallCard,
} from '@rayenz-hub/shared';
import {
  composeScryfallQuery,
  deckCardNameCounts,
  isSolePrintingPage,
  ScryfallSearchModal,
} from '../../packages/web/src/deck-builder/scryfall/ScryfallSearchModal';
import commanderFixture from '../fixtures/deck-builder/commander-slice.json';

const { searchCards, searchCardsNextPage, fetchPrintingsPage, fetchCardById } = vi.hoisted(() => ({
  searchCards: vi.fn(),
  searchCardsNextPage: vi.fn(),
  fetchPrintingsPage: vi.fn(),
  fetchCardById: vi.fn(),
}));

vi.mock('@rayenz-hub/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@rayenz-hub/shared')>();
  return {
    ...actual,
    searchCards: (...args: unknown[]) => searchCards(...args),
    searchCardsNextPage: (...args: unknown[]) => searchCardsNextPage(...args),
    fetchPrintingsPage: (...args: unknown[]) => fetchPrintingsPage(...args),
    fetchCardById: (...args: unknown[]) => fetchCardById(...args),
  };
});

const solRing: ScryfallCard = {
  id: 'sf-sol',
  name: 'Sol Ring',
  set: 'cmm',
  collector_number: '1',
  type_line: 'Artifact',
  color_identity: [],
  finishes: ['nonfoil', 'foil'],
};

const birds: ScryfallCard = {
  id: 'sf-bop',
  name: 'Birds of Paradise',
  set: 'm12',
  collector_number: '165',
  type_line: 'Creature — Bird',
  color_identity: ['G'],
  finishes: ['nonfoil'],
};

const forest: ScryfallCard = {
  id: 'sf-forest',
  name: 'Forest',
  set: 'm12',
  collector_number: '246',
  type_line: 'Basic Land — Forest',
  color_identity: ['G'],
  finishes: ['nonfoil'],
};

const baseDeck = commanderFixture as DeckDocument;

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
  localStorage.clear();
});

beforeEach(() => {
  searchCards.mockResolvedValue({
    data: [solRing, birds],
    has_more: false,
    next_page: null,
  });
  searchCardsNextPage.mockResolvedValue({
    data: [],
    has_more: false,
    next_page: null,
  });
  fetchPrintingsPage.mockResolvedValue({
    data: [solRing],
    has_more: false,
    next_page: null,
  });
  fetchCardById.mockResolvedValue(null);
});

describe('deckCardNameCounts', () => {
  it('counts quantities case-insensitively', () => {
    const counts = deckCardNameCounts({
      cards: [
        { ...baseDeck.cards[0], name: 'Sol Ring', quantity: 1 },
        { ...baseDeck.cards[0], name: 'sol ring', quantity: 2, instanceId: 'x' },
      ],
    });
    expect(counts.get('sol ring')).toBe(3);
  });
});

describe('isSolePrintingPage', () => {
  it('is true only for a complete single-printing page', () => {
    expect(isSolePrintingPage({ data: [solRing], has_more: false })).toBe(true);
    expect(isSolePrintingPage({ data: [solRing], has_more: true })).toBe(false);
    expect(isSolePrintingPage({ data: [solRing, birds], has_more: false })).toBe(false);
    expect(isSolePrintingPage({ data: [], has_more: false })).toBe(false);
  });
});

describe('ScryfallSearchModal sole printing skip', () => {
  async function searchSolRing(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByLabelText(/Scryfall query/i), 'sol');
    await user.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() => {
      expect(screen.getByRole('option', { name: /Sol Ring/i })).toBeInTheDocument();
    });
  }

  it('adds immediately when Quick add is off and there is only one printing', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    fetchPrintingsPage.mockResolvedValue({
      data: [solRing],
      has_more: false,
      next_page: null,
    });

    render(
      <ScryfallSearchModal deck={baseDeck} onClose={vi.fn()} onAdd={onAdd} allowQuickAdd />,
    );

    await searchSolRing(user);
    await user.click(screen.getByRole('option', { name: /Sol Ring/i }));

    await waitFor(() => {
      expect(onAdd).toHaveBeenCalledTimes(1);
    });
    const [printing, category, meta] = onAdd.mock.calls[0]!;
    expect(printing.name).toBe('Sol Ring');
    expect(printing.scryfallId).toBe('sf-sol');
    expect(category).toBe('Artifact');
    expect(meta).toEqual({ proxy: false });
    expect(screen.queryByRole('heading', { name: /Add —/i })).not.toBeInTheDocument();
    expect(fetchPrintingsPage).toHaveBeenCalledWith('Sol Ring', 1, {
      defaultScryfallId: 'sf-sol',
    });
  });

  it('opens the printing picker when multiple printings exist', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    const solAlt: ScryfallCard = { ...solRing, id: 'sf-sol-alt', set: 'cmr', collector_number: '2' };
    fetchPrintingsPage.mockResolvedValue({
      data: [solRing, solAlt],
      has_more: false,
      next_page: null,
    });

    render(
      <ScryfallSearchModal deck={baseDeck} onClose={vi.fn()} onAdd={onAdd} allowQuickAdd />,
    );

    await searchSolRing(user);
    await user.click(screen.getByRole('option', { name: /Sol Ring/i }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Add — Sol Ring' })).toBeInTheDocument();
    });
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('opens the printing picker when page 1 has more printings', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    fetchPrintingsPage.mockResolvedValue({
      data: [solRing],
      has_more: true,
      next_page: 'https://api.scryfall.com/cards/search?page=2',
    });

    render(<ScryfallSearchModal deck={baseDeck} onClose={vi.fn()} onAdd={onAdd} />);

    await searchSolRing(user);
    await user.click(screen.getByRole('option', { name: /Sol Ring/i }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Add — Sol Ring' })).toBeInTheDocument();
    });
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('long-press still opens the picker when there is only one printing', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onAdd = vi.fn();
    fetchPrintingsPage.mockResolvedValue({
      data: [solRing],
      has_more: false,
      next_page: null,
    });

    render(
      <ScryfallSearchModal
        deck={baseDeck}
        onClose={vi.fn()}
        onAdd={onAdd}
        allowQuickAdd
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Quick add' }));
    await searchSolRing(user);

    const option = screen.getByRole('option', { name: /Sol Ring/i });
    fireEvent.pointerDown(option, { button: 0, pointerType: 'touch', pointerId: 1 });
    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(screen.getByRole('heading', { name: 'Add — Sol Ring' })).toBeInTheDocument();
    expect(onAdd).not.toHaveBeenCalled();
  });
});

describe('ScryfallSearchModal quick add', () => {
  it('quick-adds with type default category and keepOpen; shows in-deck badge', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    const onClose = vi.fn();

    render(
      <ScryfallSearchModal
        deck={baseDeck}
        onClose={onClose}
        onAdd={onAdd}
        allowQuickAdd
      />,
    );

    expect(screen.getByRole('button', { name: 'Quick add' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    await user.click(screen.getByRole('button', { name: 'Quick add' }));
    expect(screen.getByRole('button', { name: 'Quick add' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await user.type(screen.getByLabelText(/Scryfall query/i), 't:artifact');
    await user.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() => {
      expect(screen.getByRole('option', { name: /Sol Ring/i })).toBeInTheDocument();
    });

    expect(screen.getByLabelText(/In deck ×1/i)).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Birds of Paradise/i })).toBeInTheDocument();

    await user.click(screen.getByRole('option', { name: /Sol Ring/i }));

    expect(onAdd).toHaveBeenCalledTimes(1);
    const [printing, category, meta] = onAdd.mock.calls[0];
    expect(printing.name).toBe('Sol Ring');
    expect(printing.scryfallId).toBe('sf-sol');
    expect(category).toBe('Artifact');
    expect(meta).toEqual({ proxy: false, keepOpen: true });
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('listbox', { name: 'Search results' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /Add —/i })).not.toBeInTheDocument();
  });

  it('long-press opens printing picker while quick add is on', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onAdd = vi.fn();

    render(
      <ScryfallSearchModal
        deck={baseDeck}
        onClose={vi.fn()}
        onAdd={onAdd}
        allowQuickAdd
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Quick add' }));
    await user.type(screen.getByLabelText(/Scryfall query/i), 'sol');
    await user.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() => {
      expect(screen.getByRole('option', { name: /Sol Ring/i })).toBeInTheDocument();
    });

    const option = screen.getByRole('option', { name: /Sol Ring/i });
    fireEvent.pointerDown(option, { button: 0, pointerType: 'touch', pointerId: 1 });
    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(screen.getByRole('heading', { name: 'Add — Sol Ring' })).toBeInTheDocument();
    expect(onAdd).not.toHaveBeenCalled();
    expect(fetchPrintingsPage).toHaveBeenCalled();
  });

  it('does not show Quick add toggle when allowQuickAdd is false', () => {
    render(
      <ScryfallSearchModal deck={baseDeck} onClose={vi.fn()} onAdd={vi.fn()} />,
    );
    expect(screen.queryByRole('button', { name: 'Quick add' })).not.toBeInTheDocument();
  });
});

describe('ScryfallSearchModal deck-edit singleton gestures', () => {
  async function searchWithResults(user: ReturnType<typeof userEvent.setup>, data: ScryfallCard[]) {
    searchCards.mockResolvedValue({ data, has_more: false, next_page: null });
    await user.type(screen.getByLabelText(/Scryfall query/i), 'query');
    await user.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() => {
      expect(screen.getByRole('option', { name: new RegExp(data[0]!.name, 'i') })).toBeInTheDocument();
    });
  }

  it('no-ops left-click on an in-deck non-basic when deck-edit callbacks are set', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    const onRemove = vi.fn();

    render(
      <ScryfallSearchModal
        deck={baseDeck}
        onClose={vi.fn()}
        onAdd={onAdd}
        allowQuickAdd
        onRemoveInDeckCard={onRemove}
        onInDeckContextMenu={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Quick add' }));
    await searchWithResults(user, [birds, solRing]);

    await user.click(screen.getByRole('option', { name: /Birds of Paradise/i }));
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('still quick-adds an in-deck basic land', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();

    render(
      <ScryfallSearchModal
        deck={baseDeck}
        onClose={vi.fn()}
        onAdd={onAdd}
        allowQuickAdd
        onRemoveInDeckCard={vi.fn()}
        onInDeckContextMenu={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Quick add' }));
    await searchWithResults(user, [forest]);

    await user.click(screen.getByRole('option', { name: /Forest/i }));
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd.mock.calls[0]![0].name).toBe('Forest');
  });

  it('right-click removes an in-deck card; no-ops when not in deck', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();

    render(
      <ScryfallSearchModal
        deck={baseDeck}
        onClose={vi.fn()}
        onAdd={vi.fn()}
        allowQuickAdd
        onRemoveInDeckCard={onRemove}
        onInDeckContextMenu={vi.fn()}
      />,
    );

    await searchWithResults(user, [birds, solRing]);

    fireEvent.contextMenu(screen.getByRole('option', { name: /Birds of Paradise/i }));
    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onRemove.mock.calls[0]![0].name).toBe('Birds of Paradise');

    fireEvent.contextMenu(screen.getByRole('option', { name: /Sol Ring/i }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('long-press on in-deck card opens context menu callback', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onMenu = vi.fn();

    render(
      <ScryfallSearchModal
        deck={baseDeck}
        onClose={vi.fn()}
        onAdd={vi.fn()}
        allowQuickAdd
        onRemoveInDeckCard={vi.fn()}
        onInDeckContextMenu={onMenu}
      />,
    );

    await searchWithResults(user, [birds]);

    const option = screen.getByRole('option', { name: /Birds of Paradise/i });
    fireEvent.pointerDown(option, {
      button: 0,
      pointerType: 'touch',
      pointerId: 1,
      clientX: 120,
      clientY: 80,
    });
    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(onMenu).toHaveBeenCalledTimes(1);
    expect(onMenu.mock.calls[0]![0].name).toBe('Birds of Paradise');
    expect(onMenu.mock.calls[0]![1]).toEqual(
      expect.objectContaining({
        x: expect.any(Number),
        y: expect.any(Number),
      }),
    );
    expect(screen.queryByRole('heading', { name: /Add —/i })).not.toBeInTheDocument();
  });

  it('long-press on not-in-deck card still opens printing picker with Quick add', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const onMenu = vi.fn();

    render(
      <ScryfallSearchModal
        deck={baseDeck}
        onClose={vi.fn()}
        onAdd={vi.fn()}
        allowQuickAdd
        onRemoveInDeckCard={vi.fn()}
        onInDeckContextMenu={onMenu}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Quick add' }));
    await searchWithResults(user, [solRing]);

    const option = screen.getByRole('option', { name: /Sol Ring/i });
    fireEvent.pointerDown(option, { button: 0, pointerType: 'touch', pointerId: 1 });
    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(onMenu).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Add — Sol Ring' })).toBeInTheDocument();
  });

  it('allows adding an in-deck non-basic when deck-edit callbacks are omitted (swap)', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();

    render(
      <ScryfallSearchModal
        deck={baseDeck}
        onClose={vi.fn()}
        onAdd={onAdd}
        allowQuickAdd
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Quick add' }));
    await searchWithResults(user, [birds]);

    await user.click(screen.getByRole('option', { name: /Birds of Paradise/i }));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });
});

describe('ScryfallSearchModal commander Include options', () => {
  function commanderDeckWithIdentity(): DeckDocument {
    const cmd: CardInstance = {
      instanceId: 'cmd',
      name: "Atraxa, Praetors' Voice",
      quantity: 1,
      primaryCategory: 'Commander',
      categories: ['Commander'],
      stack: null,
      setCode: 'c16',
      collectorNumber: '1',
      scryfallId: 'sf-atraxa',
      archidektCardId: null,
      foil: false,
      proxy: false,
    };
    return {
      ...baseDeck,
      cards: [cmd],
      oracle: {
        [oracleKey(cmd)]: emptyCardOracle({
          colourIdentity: ['W', 'U', 'B', 'G'],
          typeLine: 'Legendary Creature — Phyrexian Angel Horror',
          scryfallId: 'sf-atraxa',
        }),
      },
    };
  }

  it('keeps the query empty and checks Identity + Format by default', async () => {
    const user = userEvent.setup();
    const deck = commanderDeckWithIdentity();
    render(<ScryfallSearchModal deck={deck} onClose={vi.fn()} onAdd={vi.fn()} />);

    expect(screen.getByLabelText(/Scryfall query/i)).toHaveValue('');
    expect(screen.getByRole('button', { name: /Include in Scryfall search/i })).toHaveTextContent(
      /Identity, Format/i,
    );

    await user.click(screen.getByRole('button', { name: /Include in Scryfall search/i }));
    expect(screen.getByRole('checkbox', { name: /Commander identity/i })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Commander format/i })).toBeChecked();
  });

  it('appends format:commander and id:… when both includes are on', async () => {
    const user = userEvent.setup();
    const deck = commanderDeckWithIdentity();
    render(<ScryfallSearchModal deck={deck} onClose={vi.fn()} onAdd={vi.fn()} />);

    await user.type(screen.getByLabelText(/Scryfall query/i), 't:creature');
    await user.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() => {
      expect(searchCards).toHaveBeenCalledWith('t:creature format:commander id:wubg', 1);
    });
    expect(screen.getByLabelText(/Scryfall query/i)).toHaveValue('t:creature');
  });

  it('appends format:commander when no commander is set; identity no-ops', async () => {
    const user = userEvent.setup();
    render(<ScryfallSearchModal deck={baseDeck} onClose={vi.fn()} onAdd={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /Include in Scryfall search/i }));
    expect(screen.getByRole('checkbox', { name: /Commander identity/i })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Commander format/i })).toBeChecked();

    await user.type(screen.getByLabelText(/Scryfall query/i), 'sol ring');
    await user.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() => {
      expect(searchCards).toHaveBeenCalledWith('sol ring format:commander', 1);
    });
  });

  it('omits format:commander when Format is unchecked; identity still appends', async () => {
    const user = userEvent.setup();
    const deck = commanderDeckWithIdentity();
    render(<ScryfallSearchModal deck={deck} onClose={vi.fn()} onAdd={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /Include in Scryfall search/i }));
    await user.click(screen.getByRole('checkbox', { name: /Commander format/i }));
    expect(screen.getByRole('checkbox', { name: /Commander format/i })).not.toBeChecked();
    expect(screen.getByRole('button', { name: /Include in Scryfall search/i })).toHaveTextContent(
      /Identity/,
    );
    expect(screen.getByRole('button', { name: /Include in Scryfall search/i })).not.toHaveTextContent(
      /Format/,
    );

    await user.type(screen.getByLabelText(/Scryfall query/i), 't:creature');
    await user.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() => {
      expect(searchCards).toHaveBeenCalledWith('t:creature id:wubg', 1);
    });
  });

  it('omits both includes when unchecked', async () => {
    const user = userEvent.setup();
    const deck = commanderDeckWithIdentity();
    render(<ScryfallSearchModal deck={deck} onClose={vi.fn()} onAdd={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /Include in Scryfall search/i }));
    await user.click(screen.getByRole('checkbox', { name: /Commander identity/i }));
    await user.click(screen.getByRole('checkbox', { name: /Commander format/i }));
    expect(screen.getByRole('checkbox', { name: /Commander identity/i })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Commander format/i })).not.toBeChecked();
    expect(screen.getByRole('button', { name: /Include in Scryfall search/i })).toHaveTextContent(
      /None/i,
    );

    await user.type(screen.getByLabelText(/Scryfall query/i), 't:creature');
    await user.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() => {
      expect(searchCards).toHaveBeenCalledWith('t:creature', 1);
    });
  });

  it('hides Include on non-commander decks', () => {
    render(
      <ScryfallSearchModal
        deck={{ ...baseDeck, format: 'cube' }}
        onClose={vi.fn()}
        onAdd={vi.fn()}
      />,
    );
    expect(
      screen.queryByRole('button', { name: /Include in Scryfall search/i }),
    ).not.toBeInTheDocument();
  });

  it('composeScryfallQuery appends format and identity when requested and known', () => {
    const deck = commanderDeckWithIdentity();
    expect(
      composeScryfallQuery(
        't:instant',
        { includeIdentity: true, includeFormatCommander: true },
        deck,
      ),
    ).toBe('t:instant format:commander id:wubg');
    expect(
      composeScryfallQuery(
        't:instant',
        { includeIdentity: true, includeFormatCommander: false },
        deck,
      ),
    ).toBe('t:instant id:wubg');
    expect(
      composeScryfallQuery(
        't:instant',
        { includeIdentity: false, includeFormatCommander: true },
        deck,
      ),
    ).toBe('t:instant format:commander');
    expect(
      composeScryfallQuery(
        't:instant',
        { includeIdentity: false, includeFormatCommander: false },
        deck,
      ),
    ).toBe('t:instant');
    expect(
      composeScryfallQuery(
        't:instant',
        { includeIdentity: true, includeFormatCommander: true },
        baseDeck,
      ),
    ).toBe('t:instant format:commander');
  });

  it('uses r:c legal:commander as Include Format for Pendragon 98 searches', async () => {
    const user = userEvent.setup();
    const deck = { ...baseDeck, format: 'pendragon' as const };
    render(<ScryfallSearchModal deck={deck} onClose={vi.fn()} onAdd={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /Include in Scryfall search/i }));
    expect(screen.getByRole('checkbox', { name: /Pendragon format/i })).toBeChecked();

    await user.type(screen.getByLabelText(/Scryfall query/i), 'sol ring');
    await user.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() => {
      expect(searchCards).toHaveBeenCalledWith('sol ring r:c legal:commander', 1);
    });
  });

  it('composeScryfallQuery uses slot extraQuery instead of the 98 format clause', () => {
    const deck = { ...baseDeck, format: 'pendragon' as const };
    expect(
      composeScryfallQuery(
        '',
        {
          includeIdentity: false,
          includeFormatCommander: true,
          extraQuery: 't:creature r:c legal:commander',
        },
        deck,
      ),
    ).toBe('t:creature r:c legal:commander');
    expect(
      composeScryfallQuery(
        'sol ring',
        { includeIdentity: false, includeFormatCommander: true },
        deck,
      ),
    ).toBe('sol ring r:c legal:commander');
  });
});

describe('ScryfallSearchModal back to search', () => {
  type ObserverCb = IntersectionObserverCallback;
  let observerCallback: ObserverCb | null = null;
  let scrollToMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    observerCallback = null;
    scrollToMock = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      writable: true,
      value: scrollToMock,
    });
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(cb: ObserverCb) {
          observerCallback = cb;
        }
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
  });

  afterEach(() => {
    Reflect.deleteProperty(HTMLElement.prototype, 'scrollTo');
    vi.unstubAllGlobals();
  });

  function fireIntersecting(isIntersecting: boolean) {
    expect(observerCallback).toBeTruthy();
    act(() => {
      observerCallback!(
        [{ isIntersecting } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      );
    });
  }

  it('shows Back to search when the form scrolls out of view', () => {
    render(<ScryfallSearchModal deck={baseDeck} onClose={vi.fn()} onAdd={vi.fn()} />);

    expect(screen.queryByRole('button', { name: 'Back to search' })).not.toBeInTheDocument();

    fireIntersecting(false);
    expect(screen.getByRole('button', { name: 'Back to search' })).toBeInTheDocument();

    fireIntersecting(true);
    expect(screen.queryByRole('button', { name: 'Back to search' })).not.toBeInTheDocument();
  });

  it('scrolls to top and focuses the query on click', async () => {
    const user = userEvent.setup();
    render(<ScryfallSearchModal deck={baseDeck} onClose={vi.fn()} onAdd={vi.fn()} />);

    fireIntersecting(false);
    const input = screen.getByLabelText(/Scryfall query/i);
    input.blur();
    expect(input).not.toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'Back to search' }));

    expect(scrollToMock).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
    expect(input).toHaveFocus();
  });
});
