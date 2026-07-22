import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { aggregateSwapWants, type DeckDocument } from '@rayenz-hub/shared';
import { SwapQueueApp } from '../../packages/web/src/swap-queue/SwapQueueApp';

const mockLoadSwapWantSources = vi.fn();

vi.mock('../../packages/web/src/swap-queue/aggregate', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../packages/web/src/swap-queue/aggregate')>();
  return {
    ...actual,
    loadSwapWantSources: () => mockLoadSwapWantSources(),
  };
});

vi.mock('../../packages/web/src/deck-builder/store/deck-store', () => ({
  saveDeck: vi.fn(),
}));

vi.mock('../../packages/web/src/swap-queue/enrich-prices', () => ({
  enrichWantSourcesUsd: async (sources: unknown) => sources,
}));

function pairDeck(): DeckDocument {
  return {
    schemaVersion: 1,
    deckId: 'cmd1',
    name: 'Commander Deck',
    format: 'commander',
    archidektId: null,
    archidektUrl: null,
    categories: [],
    cards: [
      {
        instanceId: 'in1',
        name: 'Sol Ring',
        quantity: 1,
        primaryCategory: 'Other',
        categories: ['Other'],
        stack: null,
        setCode: null,
        collectorNumber: null,
        scryfallId: null,
        archidektCardId: null,
        foil: false,
        proxy: false,
      },
      {
        instanceId: 'out1',
        name: 'Cut Card',
        quantity: 1,
        primaryCategory: 'Other',
        categories: ['Other'],
        stack: null,
        setCode: null,
        collectorNumber: null,
        scryfallId: null,
        archidektCardId: null,
        foil: false,
        proxy: false,
      },
    ],
    oracle: {},
    formalSwapEntries: [
      {
        id: 's1',
        inInstanceId: 'in1',
        outInstanceId: 'out1',
        inTargetCategory: 'Ramp',
        sortIndex: 0,
        notes: null,
      },
    ],
    lookingForEntries: [],
    coverInstanceId: null,
    browseViewDefault: null,
    cardLayoutDefault: 'stacked',
    cardSortDefault: 'name_asc',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    lastArchidektSyncAt: null,
    lastArchidektImportAt: null,
    cubeTargetSize: null,
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  localStorage.removeItem('rayenzHubPickerCardSize');
});

describe('SwapQueueApp browse / layout', () => {
  beforeEach(() => {
    mockLoadSwapWantSources.mockResolvedValue({ decks: [], sources: [] });
  });

  it('defaults to Default + Tiles for swap-queue path', async () => {
    render(<SwapQueueApp entryPath="swap-queue" />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Browse/i })).toHaveTextContent('Default');
    });
    expect(screen.getByRole('button', { name: /Layout/i })).toHaveTextContent('Tiles');
    expect(screen.getByText(/Manage your swap queues across all of your decks/)).toBeInTheDocument();
  });

  it('defaults to Default + Grid for wishlist path', async () => {
    render(<SwapQueueApp entryPath="wishlist" />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Layout/i })).toHaveTextContent('Grid');
    });
    expect(screen.getByRole('button', { name: /Browse/i })).toHaveTextContent('Default');
  });

  it('Tiles layout shows Swaps + Seeking swimlanes and pair chrome', async () => {
    const deck = pairDeck();
    mockLoadSwapWantSources.mockResolvedValue({
      decks: [deck],
      sources: aggregateSwapWants([deck]),
    });
    render(<SwapQueueApp entryPath="swap-queue" />);
    await waitFor(() => {
      expect(screen.getByTestId('queue-tiles-view')).toHaveAttribute('data-layout', 'tiles');
    });
    expect(screen.getByTestId('swimlane-swaps')).toBeInTheDocument();
    expect(screen.getByTestId('swimlane-seeking')).toBeInTheDocument();
    expect(screen.queryByTestId('swimlane-queued_in')).not.toBeInTheDocument();
    expect(document.querySelector('.db-swap-pair')).toBeTruthy();
    const catBar = document.querySelector('.db-swap-pair .sq-tile-cat-bar');
    expect(catBar).toBeTruthy();
    expect(catBar).toHaveTextContent('Ramp');
    expect(screen.queryByText('→ Ramp')).not.toBeInTheDocument();
    expect(screen.queryByText('Commander Deck')).not.toBeInTheDocument();
  });

  it('keeps category header height when target category is empty', async () => {
    const deck = pairDeck();
    deck.formalSwapEntries[0]!.inTargetCategory = null;
    mockLoadSwapWantSources.mockResolvedValue({
      decks: [deck],
      sources: aggregateSwapWants([deck]),
    });
    render(<SwapQueueApp entryPath="swap-queue" />);
    await waitFor(() => expect(document.querySelector('.db-swap-pair')).toBeTruthy());
    const catBar = document.querySelector('.db-swap-pair .sq-tile-cat-bar');
    expect(catBar).toBeTruthy();
    expect(catBar?.textContent?.trim()).toBe('');
  });

  it('pair tiles inherit shell --db-card-w so size picker scales preview faces', async () => {
    const deck = pairDeck();
    mockLoadSwapWantSources.mockResolvedValue({
      decks: [deck],
      sources: aggregateSwapWants([deck]),
    });
    localStorage.setItem('rayenzHubPickerCardSize', 'L');
    window.dispatchEvent(new CustomEvent('rayenz-hub-card-size', { detail: 'L' }));
    render(<SwapQueueApp entryPath="swap-queue" />);
    await waitFor(() => expect(document.querySelector('.db-swap-pair')).toBeTruthy());
    const app = document.querySelector('.swap-queue-app') as HTMLElement;
    expect(app.style.getPropertyValue('--db-card-w')).toBe('310px');
    expect(app.style.getPropertyValue('--db-swap-card-w')).toBe('310px');
    expect(document.querySelector('.db-swap-pair-stack.is-preview')).toBeTruthy();
    expect(document.querySelector('.sq-lane-grid.is-pairs')).toBeTruthy();
  });

  it('Stacked layout shows per-deck overlapping stacks like the deck builder', async () => {
    const deck = pairDeck();
    mockLoadSwapWantSources.mockResolvedValue({
      decks: [deck],
      sources: aggregateSwapWants([deck]),
    });
    const user = userEvent.setup();
    render(<SwapQueueApp entryPath="swap-queue" />);
    await waitFor(() => expect(screen.getByTestId('queue-tiles-view')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /Layout/i }));
    await user.click(screen.getByRole('menuitem', { name: 'Stacked' }));

    expect(screen.getByTestId('queue-tiles-view')).toHaveAttribute('data-layout', 'stacked');
    expect(screen.getByTestId('swimlane-queued_in')).toBeInTheDocument();
    expect(screen.getByTestId('swimlane-queued_out')).toBeInTheDocument();
    expect(screen.getByTestId('swimlane-seeking')).toBeInTheDocument();
    expect(screen.queryByTestId('swimlane-swaps')).not.toBeInTheDocument();

    const queuedIn = screen.getByTestId('swimlane-queued_in');
    expect(queuedIn.querySelector('.db-cat-column')).toBeTruthy();
    expect(queuedIn.querySelector('.db-section-title')).toHaveTextContent(/Commander Deck/);
    expect(queuedIn.querySelector('.db-card-stack')).toBeTruthy();
    expect(queuedIn.querySelector('.db-card-stack-peek')).toBeTruthy();
    expect(queuedIn.querySelector('.sq-tile-cat-bar')).toBeNull();
    expect(queuedIn.querySelector('.sq-face-tile')).toBeNull();
  });

  it('Stacked layout groups Queued In into one stack column per deck', async () => {
    const a = pairDeck();
    const b: DeckDocument = {
      ...pairDeck(),
      deckId: 'cmd2',
      name: 'Second Deck',
      cards: [
        {
          ...pairDeck().cards[0]!,
          instanceId: 'in2',
          name: 'Arcane Signet',
        },
        {
          ...pairDeck().cards[1]!,
          instanceId: 'out2',
          name: 'Other Cut',
        },
      ],
      formalSwapEntries: [
        {
          id: 's2',
          inInstanceId: 'in2',
          outInstanceId: 'out2',
          inTargetCategory: 'Ramp',
          sortIndex: 0,
          notes: null,
        },
      ],
    };
    mockLoadSwapWantSources.mockResolvedValue({
      decks: [a, b],
      sources: aggregateSwapWants([a, b]),
    });
    const user = userEvent.setup();
    render(<SwapQueueApp entryPath="swap-queue" />);
    await waitFor(() => expect(screen.getByTestId('queue-tiles-view')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /Layout/i }));
    await user.click(screen.getByRole('menuitem', { name: 'Stacked' }));

    const queuedIn = screen.getByTestId('swimlane-queued_in');
    const titles = [...queuedIn.querySelectorAll('.db-section-title')].map((el) =>
      el.textContent?.replace(/\s*\(\d+\)\s*$/, '').trim(),
    );
    expect(titles).toEqual(['Commander Deck', 'Second Deck']);
    expect(queuedIn.querySelectorAll('.db-card-stack').length).toBe(2);
  });

  it('choosing Unified while on Tiles switches Layout to Stacked', async () => {
    mockLoadSwapWantSources.mockResolvedValue({ decks: [], sources: [] });
    const user = userEvent.setup();
    render(<SwapQueueApp entryPath="swap-queue" />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Layout/i })).toHaveTextContent('Tiles');
    });

    await user.click(screen.getByRole('button', { name: /Browse/i }));
    await user.click(screen.getByRole('menuitem', { name: 'Unified' }));

    expect(screen.getByRole('button', { name: /Browse/i })).toHaveTextContent('Unified');
    expect(screen.getByRole('button', { name: /Layout/i })).toHaveTextContent('Stacked');
  });

  it('choosing Tiles while Unified switches Browse to Default', async () => {
    const user = userEvent.setup();
    render(<SwapQueueApp entryPath="wishlist" />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Layout/i })).toHaveTextContent('Grid');
    });

    await user.click(screen.getByRole('button', { name: /Browse/i }));
    await user.click(screen.getByRole('menuitem', { name: 'Unified' }));
    expect(screen.getByRole('button', { name: /Browse/i })).toHaveTextContent('Unified');

    await user.click(screen.getByRole('button', { name: /Layout/i }));
    await user.click(screen.getByRole('menuitem', { name: 'Tiles' }));

    expect(screen.getByRole('button', { name: /Browse/i })).toHaveTextContent('Default');
    expect(screen.getByRole('button', { name: /Layout/i })).toHaveTextContent('Tiles');
  });
});
