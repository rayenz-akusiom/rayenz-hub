import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DeckDocument, ScryfallCard } from '@rayenz-hub/shared';
import { PrintingPickerModal } from '../../packages/web/src/deck-builder/scryfall/PrintingPickerModal';
import { ScryfallSearchModal } from '../../packages/web/src/deck-builder/scryfall/ScryfallSearchModal';
import commanderFixture from '../fixtures/deck-builder/commander-slice.json';

const {
  searchCards,
  searchCardsNextPage,
  fetchPrintingsPage,
  fetchCardById,
} = vi.hoisted(() => ({
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

const page1Print: ScryfallCard = {
  id: 'sf-forest-1',
  name: 'Forest',
  set: 'lea',
  collector_number: '294',
  type_line: 'Basic Land — Forest',
  color_identity: ['G'],
  finishes: ['nonfoil'],
};

const page2Print: ScryfallCard = {
  id: 'sf-forest-2',
  name: 'Forest',
  set: 'unf',
  collector_number: '262',
  type_line: 'Basic Land — Forest',
  color_identity: ['G'],
  finishes: ['nonfoil', 'foil'],
};

const searchPage1: ScryfallCard = {
  id: 'sf-a',
  name: 'Card A',
  set: 'mh2',
  collector_number: '1',
  type_line: 'Creature',
  color_identity: [],
  finishes: ['nonfoil'],
};

const searchPage2: ScryfallCard = {
  id: 'sf-b',
  name: 'Card B',
  set: 'mh2',
  collector_number: '2',
  type_line: 'Creature',
  color_identity: [],
  finishes: ['nonfoil'],
};

const baseDeck = commanderFixture as DeckDocument;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  localStorage.clear();
});

beforeEach(() => {
  fetchCardById.mockResolvedValue(null);
});

describe('PrintingPickerModal pagination', () => {
  it('renders page 1 without waiting for page 2, then loads more via sentinel', async () => {
    let resolvePage2: ((value: unknown) => void) | null = null;
    const page2Promise = new Promise((resolve) => {
      resolvePage2 = resolve;
    });

    fetchPrintingsPage.mockResolvedValue({
      data: [page1Print],
      has_more: true,
      next_page: 'https://api.scryfall.com/cards/search?page=2',
    });
    searchCardsNextPage.mockImplementation(() => page2Promise);

    const observers: IntersectionObserverCallback[] = [];
    const OriginalIO = globalThis.IntersectionObserver;
    class MockIO {
      constructor(cb: IntersectionObserverCallback) {
        observers.push(cb);
      }
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    }
    vi.stubGlobal('IntersectionObserver', MockIO);

    render(
      <PrintingPickerModal
        cardName="Forest"
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('option', { name: /LEA #294/i })).toBeInTheDocument();
    });
    expect(screen.queryByRole('option', { name: /UNF #262/i })).not.toBeInTheDocument();
    expect(fetchPrintingsPage).toHaveBeenCalledTimes(1);
    expect(searchCardsNextPage).not.toHaveBeenCalled();

    // Trigger infinite-scroll sentinel
    expect(observers.length).toBeGreaterThan(0);
    observers[0]!([
      {
        isIntersecting: true,
        target: document.createElement('div'),
      } as IntersectionObserverEntry,
    ], {} as IntersectionObserver);

    await waitFor(() => {
      expect(searchCardsNextPage).toHaveBeenCalledWith(
        'https://api.scryfall.com/cards/search?page=2',
      );
    });
    expect(screen.getByText(/Loading more/i)).toBeInTheDocument();

    resolvePage2!({
      data: [page2Print],
      has_more: false,
      next_page: null,
    });

    await waitFor(() => {
      expect(screen.getByRole('option', { name: /UNF #262/i })).toBeInTheDocument();
    });
    expect(screen.queryByText(/Loading more/i)).not.toBeInTheDocument();

    vi.stubGlobal('IntersectionObserver', OriginalIO);
  });

  it('pins selected printing missing from page 1', async () => {
    const pinned: ScryfallCard = {
      ...page2Print,
      id: 'sf-pinned',
      set: 'sld',
      collector_number: '999',
    };
    fetchPrintingsPage.mockResolvedValue({
      data: [page1Print],
      has_more: false,
      next_page: null,
    });
    fetchCardById.mockResolvedValue(pinned);

    render(
      <PrintingPickerModal
        cardName="Forest"
        selectedScryfallId="sf-pinned"
        defaultScryfallId="sf-pinned"
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('option', { name: /SLD #999/i })).toBeInTheDocument();
    });
    expect(screen.getByRole('option', { name: /SLD #999/i })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(fetchCardById).toHaveBeenCalledWith('sf-pinned');
  });

  it('refetches printings when set codes are applied and cleared', async () => {
    const user = userEvent.setup();
    const onSetCodesChange = vi.fn();
    fetchPrintingsPage.mockImplementation(async (_name, _page, opts?: { setCodes?: string[] }) => {
      const codes = opts?.setCodes || [];
      if (codes.includes('UNF')) {
        return { data: [page2Print], has_more: false, next_page: null };
      }
      return { data: [page1Print], has_more: false, next_page: null };
    });

    render(
      <PrintingPickerModal
        cardName="Forest"
        onConfirm={vi.fn()}
        onClose={vi.fn()}
        onSetCodesChange={onSetCodesChange}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('option', { name: /LEA #294/i })).toBeInTheDocument();
    });
    expect(fetchPrintingsPage).toHaveBeenCalledWith('Forest', 1, {
      defaultScryfallId: null,
      setCodes: [],
    });

    await user.type(screen.getByLabelText('Set codes'), 'unf');
    await user.click(screen.getByRole('button', { name: 'Apply set filter' }));

    await waitFor(() => {
      expect(screen.getByRole('option', { name: /UNF #262/i })).toBeInTheDocument();
    });
    expect(screen.queryByRole('option', { name: /LEA #294/i })).not.toBeInTheDocument();
    expect(onSetCodesChange).toHaveBeenCalledWith(['UNF']);
    expect(fetchPrintingsPage).toHaveBeenCalledWith('Forest', 1, {
      defaultScryfallId: null,
      setCodes: ['UNF'],
    });

    await user.click(screen.getByRole('button', { name: 'Clear set filter' }));

    await waitFor(() => {
      expect(screen.getByRole('option', { name: /LEA #294/i })).toBeInTheDocument();
    });
    expect(onSetCodesChange).toHaveBeenCalledWith([]);
    expect(fetchPrintingsPage).toHaveBeenLastCalledWith('Forest', 1, {
      defaultScryfallId: null,
      setCodes: [],
    });
  });

  it('loads with host setCodes and does not pin a printing from another set', async () => {
    fetchPrintingsPage.mockResolvedValue({
      data: [page2Print],
      has_more: false,
      next_page: null,
    });

    render(
      <PrintingPickerModal
        cardName="Forest"
        setCodes={['UNF']}
        selectedScryfallId="sf-pinned"
        defaultScryfallId="sf-pinned"
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole('option', { name: /UNF #262/i })).toBeInTheDocument();
    });
    expect(fetchPrintingsPage).toHaveBeenCalledWith('Forest', 1, {
      defaultScryfallId: null,
      setCodes: ['UNF'],
    });
    expect(fetchCardById).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Set codes')).toHaveValue('UNF');
  });
});

describe('ScryfallSearchModal infinite scroll', () => {
  it('loads page 2 when the sentinel intersects', async () => {
    const user = userEvent.setup();
    searchCards.mockResolvedValue({
      data: [searchPage1],
      has_more: true,
      next_page: 'https://api.scryfall.com/cards/search?page=2',
    });
    searchCardsNextPage.mockResolvedValue({
      data: [searchPage2],
      has_more: false,
      next_page: null,
    });

    const observers: IntersectionObserverCallback[] = [];
    const OriginalIO = globalThis.IntersectionObserver;
    class MockIO {
      constructor(cb: IntersectionObserverCallback) {
        observers.push(cb);
      }
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    }
    vi.stubGlobal('IntersectionObserver', MockIO);

    render(
      <ScryfallSearchModal deck={baseDeck} onClose={vi.fn()} onAdd={vi.fn()} />,
    );

    await user.type(screen.getByLabelText(/Scryfall query/i), 't:creature');
    await user.click(screen.getByRole('button', { name: 'Search' }));

    await waitFor(() => {
      expect(screen.getByRole('option', { name: /Card A/i })).toBeInTheDocument();
    });
    expect(screen.queryByRole('option', { name: /Card B/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Load more/i })).not.toBeInTheDocument();

    // Last observer is the infinite-scroll sentinel (form observer may register first).
    const loadMoreObserver = observers[observers.length - 1]!;
    loadMoreObserver(
      [
        {
          isIntersecting: true,
          target: document.createElement('div'),
        } as IntersectionObserverEntry,
      ],
      {} as IntersectionObserver,
    );

    await waitFor(() => {
      expect(screen.getByRole('option', { name: /Card B/i })).toBeInTheDocument();
    });
    expect(searchCardsNextPage).toHaveBeenCalled();

    vi.stubGlobal('IntersectionObserver', OriginalIO);
  });
});
