import './helpers/swap-queue-vi-mocks';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toDeckSummary } from '@rayenz-hub/shared';
import {
  lookingForDeck,
  mockLoadSwapWantSources,
  mockLoadTheorySeekingSources,
  mockPullRemoteLibraryUpdates,
  wantSource,
} from './helpers/swap-queue-harness';
import { SwapQueueApp } from '../../packages/web/src/swap-queue/SwapQueueApp';
import {
  THEORY_DECK_IDS_STORAGE_KEY,
  SQ_ACTIONS_OVERFLOW_MQ,
  SQ_CORE_OVERFLOW_MQ,
} from '../../packages/web/src/swap-queue/theory-prefs';

const mockCopyArchidektWants = vi.fn();

vi.mock('../../packages/web/src/swap-queue/export-ui', () => ({
  copyArchidektWants: (...args: unknown[]) => mockCopyArchidektWants(...args),
  copyNameQtyWants: vi.fn(),
  copyText: vi.fn(),
}));

function stubMatchMedia(matches: (query: string) => boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: matches(query),
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  localStorage.removeItem(THEORY_DECK_IDS_STORAGE_KEY);
});

describe('SwapQueueApp theory Seeking opt-in', () => {
  beforeEach(() => {
    stubMatchMedia(() => false);
    mockLoadSwapWantSources.mockResolvedValue({ decks: [], sources: [] });
    mockLoadTheorySeekingSources.mockResolvedValue({ decks: [], sources: [] });
    mockPullRemoteLibraryUpdates.mockResolvedValue([]);
  });

  it('shows Theory lane CTA and picker, then Seeking from selected theory decks', async () => {
    const theory = lookingForDeck({
      deckId: 'theory1',
      name: 'Theory Brew',
      ownership: 'theory',
      cards: lookingForDeck().cards,
      lookingForEntries: [{ id: 'lf1', instanceId: 'c1', sortIndex: 0, notes: null }],
    });
    mockPullRemoteLibraryUpdates.mockResolvedValue([toDeckSummary(theory)]);
    mockLoadTheorySeekingSources.mockResolvedValue({
      decks: [theory],
      sources: [
        wantSource({
          deckId: 'theory1',
          deckName: 'Theory Brew',
          kind: 'seeking',
          entryId: 'lf1',
          cardInstanceId: 'c1',
          cardName: 'Counterspell',
          mergeKey: 'counterspell',
          outInstanceId: null,
          inInstanceId: null,
        }),
      ],
    });

    const user = userEvent.setup();
    render(<SwapQueueApp entryPath="swap-queue" />);

    await waitFor(() => {
      expect(screen.getByTestId('swimlane-theory')).toBeInTheDocument();
    });
    expect(
      within(screen.getByTestId('swimlane-theory')).getByText(
        /Choose theory decks to include in Seeking for purchase lists/,
      ),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Theory' }));
    const picker = await screen.findByTestId('swap-queue-theory-decks');
    await user.click(within(picker).getByRole('checkbox', { name: 'Theory Brew' }));

    await waitFor(() => {
      expect(mockLoadTheorySeekingSources).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(
        within(screen.getByTestId('swimlane-theory')).getByText(/Counterspell/),
      ).toBeInTheDocument();
    });
    expect(JSON.parse(localStorage.getItem(THEORY_DECK_IDS_STORAGE_KEY) || '[]')).toEqual([
      'theory1',
    ]);

    mockCopyArchidektWants.mockResolvedValue(true);
    await user.click(screen.getByRole('button', { name: 'Export Archidekt' }));
    expect(mockCopyArchidektWants).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ deckId: 'theory1', cardName: 'Counterspell', kind: 'seeking' }),
      ]),
    );
  });

  it('keeps unselected theory Seeking off the page', async () => {
    mockLoadSwapWantSources.mockResolvedValue({
      decks: [],
      sources: [
        wantSource({
          kind: 'seeking',
          cardName: 'Owned Seek',
          mergeKey: 'owned seek',
          outInstanceId: null,
          inInstanceId: null,
        }),
      ],
    });
    render(<SwapQueueApp entryPath="swap-queue" />);
    await waitFor(() => expect(screen.getByText(/Owned Seek/)).toBeInTheDocument());
    expect(mockLoadTheorySeekingSources).toHaveBeenCalledWith(expect.anything(), []);
    expect(screen.queryByText(/Counterspell/)).not.toBeInTheDocument();
  });
});

describe('SwapQueueApp chrome overflow', () => {
  beforeEach(() => {
    mockLoadSwapWantSources.mockResolvedValue({
      decks: [],
      sources: [wantSource()],
    });
  });

  it('puts export actions in the hamburger at the actions breakpoint', async () => {
    stubMatchMedia((query) => query === SQ_ACTIONS_OVERFLOW_MQ);
    const user = userEvent.setup();
    render(<SwapQueueApp entryPath="wishlist" />);
    await waitFor(() => expect(screen.getByText(/Sol Ring/)).toBeInTheDocument());

    expect(screen.queryByTestId('sq-action-controls')).not.toBeInTheDocument();
    expect(screen.getByTestId('sq-core-controls')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Swap Queue actions' }));
    expect(screen.getByRole('menuitem', { name: 'Export Archidekt' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Refresh' })).toBeInTheDocument();
  });

  it('also moves Browse and Layout into the hamburger at the core breakpoint', async () => {
    stubMatchMedia(
      (query) => query === SQ_ACTIONS_OVERFLOW_MQ || query === SQ_CORE_OVERFLOW_MQ,
    );
    const user = userEvent.setup();
    render(<SwapQueueApp entryPath="wishlist" />);
    await waitFor(() => expect(screen.getByText(/Sol Ring/)).toBeInTheDocument());

    expect(screen.queryByRole('button', { name: /Browse/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Swap Queue actions' }));
    expect(screen.getByRole('menuitem', { name: 'Browse: Default' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Layout: Grid' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Export Archidekt' })).toBeInTheDocument();
  });
});
