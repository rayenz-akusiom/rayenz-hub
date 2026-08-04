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

describe('ScryfallSearchModal commander identity include', () => {
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

  it('keeps the query empty and checks Commander identity by default', async () => {
    const user = userEvent.setup();
    const deck = commanderDeckWithIdentity();
    render(<ScryfallSearchModal deck={deck} onClose={vi.fn()} onAdd={vi.fn()} />);

    expect(screen.getByLabelText(/Scryfall query/i)).toHaveValue('');
    expect(screen.getByRole('button', { name: /Include in Scryfall search/i })).toHaveTextContent(
      /Identity/i,
    );

    await user.click(screen.getByRole('button', { name: /Include in Scryfall search/i }));
    const checkbox = screen.getByRole('checkbox', { name: /Commander identity/i });
    expect(checkbox).toBeChecked();
  });

  it('appends id:… to the Scryfall request when identity is included', async () => {
    const user = userEvent.setup();
    const deck = commanderDeckWithIdentity();
    render(<ScryfallSearchModal deck={deck} onClose={vi.fn()} onAdd={vi.fn()} />);

    await user.type(screen.getByLabelText(/Scryfall query/i), 't:creature');
    await user.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() => {
      expect(searchCards).toHaveBeenCalledWith('t:creature id:wubg', 1);
    });
    expect(screen.getByLabelText(/Scryfall query/i)).toHaveValue('t:creature');
  });

  it('no-ops identity when no commander is set but leaves the checkbox checked', async () => {
    const user = userEvent.setup();
    render(<ScryfallSearchModal deck={baseDeck} onClose={vi.fn()} onAdd={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /Include in Scryfall search/i }));
    expect(screen.getByRole('checkbox', { name: /Commander identity/i })).toBeChecked();

    await user.type(screen.getByLabelText(/Scryfall query/i), 'sol ring');
    await user.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() => {
      expect(searchCards).toHaveBeenCalledWith('sol ring', 1);
    });
  });

  it('omits identity when the include checkbox is unchecked', async () => {
    const user = userEvent.setup();
    const deck = commanderDeckWithIdentity();
    render(<ScryfallSearchModal deck={deck} onClose={vi.fn()} onAdd={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: /Include in Scryfall search/i }));
    await user.click(screen.getByRole('checkbox', { name: /Commander identity/i }));
    expect(screen.getByRole('checkbox', { name: /Commander identity/i })).not.toBeChecked();

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

  it('composeScryfallQuery appends identity only when requested and known', () => {
    const deck = commanderDeckWithIdentity();
    expect(composeScryfallQuery('t:instant', true, deck)).toBe('t:instant id:wubg');
    expect(composeScryfallQuery('t:instant', false, deck)).toBe('t:instant');
    expect(composeScryfallQuery('t:instant', true, baseDeck)).toBe('t:instant');
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
