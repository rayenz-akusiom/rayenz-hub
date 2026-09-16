import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { aggregateSwapWants, type DeckSummary, type WantSource } from '@rayenz-hub/shared';
import { pairDeck } from './helpers/swap-queue-harness';
import { PlayerProfileApp } from '../../packages/web/src/player-profile/PlayerProfileApp';
import { navigateHub } from '../../packages/web/src/lib/hub-storage';
import { copyText } from '../../packages/web/src/swap-queue/export-ui';

const apiListPublicDecks = vi.fn();
const loadPublicSwapWantSources = vi.fn();
const enrichWantSourcesUsd = vi.fn(async (sources: WantSource[]) => sources);

vi.mock('../../packages/web/src/lib/hub-progress', () => ({
  HubProgress: {
    mount: () => ({
      start: vi.fn(),
      update: vi.fn(),
      finish: vi.fn(),
      dismiss: vi.fn(),
    }),
    isActive: () => false,
    isFinished: () => false,
  },
}));

vi.mock('../../packages/web/src/deck-builder/store/deck-api', () => ({
  apiListPublicDecks: (...args: unknown[]) => apiListPublicDecks(...args),
}));

vi.mock('../../packages/web/src/swap-queue/aggregate', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../packages/web/src/swap-queue/aggregate')>();
  return {
    ...actual,
    loadPublicSwapWantSources: (...args: unknown[]) => loadPublicSwapWantSources(...args),
  };
});

vi.mock('../../packages/web/src/swap-queue/enrich-prices', () => ({
  enrichWantSourcesUsd: (sources: WantSource[]) => enrichWantSourcesUsd(sources),
}));

vi.mock('../../packages/web/src/swap-queue/export-ui', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../packages/web/src/swap-queue/export-ui')>();
  return {
    ...actual,
    copyText: vi.fn(async () => true),
  };
});

vi.mock('../../packages/web/src/lib/hub-storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../packages/web/src/lib/hub-storage')>();
  return {
    ...actual,
    navigateHub: vi.fn((hash: string) => {
      window.location.hash = hash.startsWith('#') ? hash : `#${hash}`;
    }),
  };
});

function summary(over: Partial<DeckSummary> & Pick<DeckSummary, 'deckId' | 'name'>): DeckSummary {
  return {
    format: 'commander',
    ownership: 'owned',
    visibility: 'public',
    updatedAt: '2026-01-01T00:00:00.000Z',
    archidektId: null,
    coverImageUrl: null,
    coverImageUrlSecondary: null,
    coverPartnerStatus: null,
    coverCardName: null,
    ...over,
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.location.hash = '';
});

describe('PlayerProfileApp', () => {
  beforeEach(() => {
    apiListPublicDecks.mockReset();
    loadPublicSwapWantSources.mockReset();
    enrichWantSourcesUsd.mockReset();
    enrichWantSourcesUsd.mockImplementation(async (sources: WantSource[]) => sources);
    apiListPublicDecks.mockResolvedValue(null);
    loadPublicSwapWantSources.mockResolvedValue(null);
  });

  it('shows not found for an unknown username', async () => {
    window.location.hash = '#/u/nobody';
    render(<PlayerProfileApp />);

    await waitFor(() => {
      expect(screen.getByTestId('pp-not-found')).toHaveTextContent('nobody');
    });
    expect(apiListPublicDecks).toHaveBeenCalledWith('nobody', { previewPerFormat: 5 });
    expect(loadPublicSwapWantSources).toHaveBeenCalledWith('nobody');
  });

  it('loads public library tiles and swap queue counts', async () => {
    const deck = pairDeck();
    apiListPublicDecks.mockResolvedValue({
      username: 'Friend',
      slug: 'friend',
      decks: [summary({ deckId: deck.deckId, name: deck.name, coverCardName: 'Atraxa' })],
    });
    loadPublicSwapWantSources.mockResolvedValue({
      username: 'Friend',
      slug: 'friend',
      decks: [deck],
      sources: aggregateSwapWants([deck]),
    });
    window.location.hash = '#/u/friend';
    render(<PlayerProfileApp />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Friend' })).toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: /Commander Deck/i })).toHaveAttribute(
      'href',
      '#/commander-builder/friend/commander-deck',
    );
    await waitFor(() => {
      expect(screen.getByTestId('pp-queue-counts')).toHaveTextContent(/Seeking 0/);
    });
    expect(screen.getByTestId('pp-queue-counts')).toHaveTextContent(/Queued In 1/);
    expect(screen.getByTestId('pp-queue-counts')).toHaveTextContent(/Out 1/);
  });

  it('shows library before swaps finish', async () => {
    let resolveSwaps: (value: unknown) => void = () => {};
    const swapsPending = new Promise((resolve) => {
      resolveSwaps = resolve;
    });
    apiListPublicDecks.mockResolvedValue({
      username: 'Friend',
      slug: 'friend',
      decks: [summary({ deckId: 'd1', name: 'Fast Deck' })],
    });
    loadPublicSwapWantSources.mockReturnValue(swapsPending);
    window.location.hash = '#/u/friend';
    render(<PlayerProfileApp />);

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /Fast Deck/i })).toBeInTheDocument();
    });
    expect(screen.getByTestId('pp-swaps-loading')).toBeInTheDocument();

    resolveSwaps({
      username: 'Friend',
      slug: 'friend',
      decks: [],
      sources: [],
    });
    await waitFor(() => {
      expect(screen.getByText('No public swap queue entries.')).toBeInTheDocument();
    });
  });

  it('caps each format to five most recent decks', async () => {
    const decks = Array.from({ length: 7 }, (_, i) =>
      summary({
        deckId: `c${i}`,
        name: `Commander ${i}`,
        updatedAt: `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`,
      }),
    );
    apiListPublicDecks.mockResolvedValue({
      username: 'Friend',
      slug: 'friend',
      decks,
    });
    loadPublicSwapWantSources.mockResolvedValue({
      username: 'Friend',
      slug: 'friend',
      decks: [],
      sources: [],
    });
    window.location.hash = '#/u/friend';
    render(<PlayerProfileApp />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Friend' })).toBeInTheDocument();
    });
    expect(screen.getByRole('link', { name: /Commander 6/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Commander 2/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Commander 0/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Commander 1/i })).not.toBeInTheDocument();
  });

  it('shows empty sections when the user has no public decks or queues', async () => {
    apiListPublicDecks.mockResolvedValue({
      username: 'Empty',
      slug: 'empty',
      decks: [],
    });
    loadPublicSwapWantSources.mockResolvedValue({
      username: 'Empty',
      slug: 'empty',
      decks: [],
      sources: [],
    });
    window.location.hash = '#/u/empty';
    render(<PlayerProfileApp />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Empty' })).toBeInTheDocument();
    });
    expect(screen.getByText('No public decks.')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('No public swap queue entries.')).toBeInTheDocument();
    });
  });

  it('copies the profile share link', async () => {
    apiListPublicDecks.mockResolvedValue({
      username: 'Friend',
      slug: 'friend',
      decks: [],
    });
    loadPublicSwapWantSources.mockResolvedValue({
      username: 'Friend',
      slug: 'friend',
      decks: [],
      sources: [],
    });
    window.location.hash = '#/u/friend';
    const user = userEvent.setup();
    render(<PlayerProfileApp />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Copy share link' })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: 'Copy share link' }));
    await waitFor(() => {
      expect(copyText).toHaveBeenCalledWith(
        `${window.location.origin}${window.location.pathname}#/u/friend`,
      );
    });
    expect(screen.getByText('Link copied.')).toBeInTheDocument();
  });

  it('opens the full swap queue from the CTA', async () => {
    apiListPublicDecks.mockResolvedValue({
      username: 'Friend',
      slug: 'friend',
      decks: [],
    });
    loadPublicSwapWantSources.mockResolvedValue({
      username: 'Friend',
      slug: 'friend',
      decks: [],
      sources: [],
    });
    window.location.hash = '#/u/friend';
    const user = userEvent.setup();
    render(<PlayerProfileApp />);

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Open Swap Queue' })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('link', { name: 'Open Swap Queue' }));
    expect(navigateHub).toHaveBeenCalledWith('#/swap-queue/friend');
  });
});
