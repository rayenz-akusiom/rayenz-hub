import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OrderReconcileAssign } from '../../packages/web/src/order-reconcile/OrderReconcileAssign';
import { OrderReconcileDeckPanel } from '../../packages/web/src/order-reconcile/OrderReconcileDeck';
import { OrderReconcileStaging } from '../../packages/web/src/order-reconcile/OrderReconcileStaging';
import { STAGING_DECK_ID } from '../../packages/web/src/order-reconcile/types';
import type {
  NeedsReviewItem,
  OrderReconcileDeck,
  OrderReconcileState,
  ReconcileItem,
} from '../../packages/web/src/order-reconcile/types';

const mockValidateScryfallName = vi.fn(() => Promise.resolve(true));
const mockResolveCubeDestination = vi.fn(() =>
  Promise.resolve({ category: 'New Set In', colorIdentityCache: { cube: ['W'] } }),
);
const mockBuildAssignmentPlan = vi.fn();
const mockIsCubeDeck = vi.fn(() => false);
const mockDeckCategories = vi.fn(() => ['New Set In', 'Ramp', 'Removal']);
const mockCopyText = vi.fn(() => Promise.resolve());
const mockStageDeckApply = vi.fn();
const mockBridgeApplyAvailable = vi.fn(() => false);

vi.mock('../../packages/web/src/order-reconcile/data', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../packages/web/src/order-reconcile/data')>();
  return {
    ...actual,
    validateScryfallName: (...args: unknown[]) => mockValidateScryfallName(...args),
    resolveCubeDestinationForCard: (...args: unknown[]) => mockResolveCubeDestination(...args),
    fetchPrintings: vi.fn(() =>
      Promise.resolve([
        {
          id: 'sf-sol',
          name: 'Sol Ring',
          set: 'cmm',
          collector_number: '1',
          layout: 'normal',
          finishes: ['nonfoil', 'foil'],
        },
      ]),
    ),
  };
});

vi.mock('../../packages/web/src/order-reconcile/assign', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../packages/web/src/order-reconcile/assign')>();
  return {
    ...actual,
    buildAssignmentPlan: (...args: unknown[]) => mockBuildAssignmentPlan(...args),
  };
});

vi.mock('../../packages/web/src/mtg/order-reconcile-export', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../packages/web/src/mtg/order-reconcile-export')>();
  return {
    ...actual,
    OrderReconcileExport: {
      ...actual.OrderReconcileExport,
      deckCategories: (...args: unknown[]) => mockDeckCategories(...args),
      isCubeDeck: (...args: unknown[]) => mockIsCubeDeck(...args),
      deckReconcileComplete: (items: ReconcileItem[], getDecision: (id: string) => { status?: string } | null | undefined) => {
        const total = items.length;
        const accepted = items.filter((item) => getDecision(item.item_id)?.status === 'accepted').length;
        return { complete: accepted === total && total > 0, accepted, total };
      },
    },
  };
});

vi.mock('../../packages/web/src/mtg/archidekt-export', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../packages/web/src/mtg/archidekt-export')>();
  return {
    ...actual,
    ArchidektExport: {
      ...actual.ArchidektExport,
      copyText: (...args: unknown[]) => mockCopyText(...args),
      stageDeckApply: (...args: unknown[]) => mockStageDeckApply(...args),
      parseDeckId: () => '12345',
    },
  };
});

vi.mock('../../packages/web/src/lib/hub-utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../packages/web/src/lib/hub-utils')>();
  return {
    ...actual,
    bridgeApplyAvailable: (...args: unknown[]) => mockBridgeApplyAvailable(...args),
  };
});

function sampleDeck(over: Partial<OrderReconcileDeck> = {}): OrderReconcileDeck {
  return {
    deck_id: 'deck-1',
    deck_name: 'Test Commander',
    archidekt_url: 'https://archidekt.com/decks/12345/test',
    deck_snapshot: {
      fetched_at: '2026-01-01',
      cards: [
        { name: 'Sol Ring', primary_category: 'New Set In', categories: ['New Set In'] },
        { name: 'Lightning Bolt', primary_category: 'Ramp', categories: ['Ramp'] },
      ],
    },
    ...over,
  };
}

function baseState(over: Partial<OrderReconcileState> = {}): OrderReconcileState {
  return {
    phase: 'assign',
    sessionId: 'sess-1',
    settings: {
      folderUrl: 'https://archidekt.com/folders/1',
      stagingDeckUrl: 'https://archidekt.com/decks/99999/staging',
      registrySource: 'folder',
      customDeckUrls: '',
    },
    acquiredCards: [{ id: 'acq-1', name: 'Shock' }],
    copies: [],
    assignments: [
      {
        copy_id: 'copy-auto',
        card_name: 'Sol Ring',
        deck_id: 'deck-1',
        deck_name: 'Test Commander',
        slot_key: 'slot-1',
        queued_in: { name: 'Sol Ring' },
        paired_out: { name: 'Lightning Bolt' },
        destination_category: 'New Set In',
        is_cube: false,
        maybeboard_entry: null,
        reason: 'matched',
      },
    ],
    copies: [
      {
        copy_id: 'copy-auto',
        acquired_id: 'acq-0',
        card_name: 'Sol Ring',
        set_code: 'cmm',
        collector_number: '1',
      },
    ],
    needsReview: [],
    decks: [sampleDeck()],
    stagingDeck: sampleDeck({
      deck_id: STAGING_DECK_ID,
      deck_name: 'Buy / trade list',
      archidekt_url: 'https://archidekt.com/decks/99999/staging',
    }),
    reconcileItems: [],
    completedDecks: {},
    activeDeckId: null,
    assignmentIndex: { swapByName: {}, maybeboardByName: {} },
    inputMode: 'list',
    isProxyOrder: false,
    colorIdentityCache: {},
    progress: { decisions: {} },
    statusMessage: '',
    ...over,
  };
}

function needsReviewItem(over: Partial<NeedsReviewItem> = {}): NeedsReviewItem {
  return {
    copy: {
      copy_id: 'copy-review',
      acquired_id: 'acq-1',
      card_name: 'Shock',
      set_code: 'mh2',
      collector_number: '1',
    },
    reason: 'unmatched',
    candidates: [],
    assigned_deck_id: '',
    destination_category: '',
    ...over,
  };
}

function reconcileItem(over: Partial<ReconcileItem> = {}): ReconcileItem {
  return {
    item_id: 'item-1',
    copy_id: 'copy-1',
    slot_key: 'slot-1',
    deck_id: 'deck-1',
    deck_name: 'Test Commander',
    card_name: 'Sol Ring',
    quantity: 1,
    queued_in: { name: 'Sol Ring', set_code: 'cmm', collector_number: '1' },
    paired_out: { name: 'Lightning Bolt', set_code: 'mh2', collector_number: '123' },
    destination_category: '',
    is_cube: false,
    maybeboard_entry: null,
    acquired_set: 'cmm',
    acquired_collector: '1',
    type: 'swap',
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockValidateScryfallName.mockResolvedValue(true);
  mockIsCubeDeck.mockReturnValue(false);
  mockBridgeApplyAvailable.mockReturnValue(false);
  mockBuildAssignmentPlan.mockResolvedValue({
    assignmentIndex: {},
    copies: [],
    assignments: [],
    needsReview: [],
    colorIdentityCache: {},
  });
  window.scrollTo = vi.fn() as typeof window.scrollTo;
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

describe('OrderReconcileAssign', () => {
  it('shows empty assign state and starts reconcile', async () => {
    const onStartReconcile = vi.fn();
    const user = userEvent.setup();

    render(
      <OrderReconcileAssign
        state={baseState()}
        onNeedsReviewChange={vi.fn()}
        onAcquiredCardsChange={vi.fn()}
        onStartReconcile={onStartReconcile}
        onStatus={vi.fn()}
        onRebuildPlan={vi.fn()}
      />,
    );

    expect(screen.getByText('All copies assigned automatically.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Start reconcile' }));
    expect(onStartReconcile).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ deck_id: 'deck-1', card_name: 'Sol Ring' }),
      ]),
      'deck-1',
    );
  });

  it('shows proxy banner and review rows for conflict and extra reasons', async () => {
    const state = baseState({
      isProxyOrder: true,
      needsReview: [
        needsReviewItem({
          reason: 'conflict',
          conflict_note: 'Two decks want this copy',
          candidates: [
            {
              deck_id: 'deck-1',
              deck_name: 'Test Commander',
              slot_key: 'slot-1',
              queued_in: { name: 'Shock' },
              paired_out: null,
              destination_category: 'New Set In',
              is_cube: false,
              maybeboard_entry: null,
            },
          ],
          assigned_deck_id: 'deck-1',
          destination_category: 'New Set In',
        }),
        needsReviewItem({
          reason: 'extra',
          copy: {
            copy_id: 'copy-extra',
            acquired_id: 'acq-2',
            card_name: 'Sol Ring',
          },
        }),
      ],
    });

    render(
      <OrderReconcileAssign
        state={state}
        onNeedsReviewChange={vi.fn()}
        onAcquiredCardsChange={vi.fn()}
        onStartReconcile={vi.fn()}
        onStatus={vi.fn()}
        onRebuildPlan={vi.fn()}
      />,
    );

    expect(screen.getByText(/Proxy order active/i)).toBeInTheDocument();
    expect(screen.getByText('Two decks want this copy')).toBeInTheDocument();
    expect(screen.getByText(/Already assigned to: Test Commander/i)).toBeInTheDocument();
  });
});

describe('OrderReconcileDeckPanel', () => {
  it('shows validation errors when accepting without category', async () => {
    const onDecision = vi.fn();
    const user = userEvent.setup();

    render(
      <OrderReconcileDeckPanel
        state={baseState({ isProxyOrder: true })}
        deck={sampleDeck()}
        items={[reconcileItem()]}
        onDecision={onDecision}
        onItemChange={vi.fn()}
        onCompleteDeck={vi.fn()}
        onStatus={vi.fn()}
      />,
    );

    expect(screen.getByText(/Proxy order active/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Accept' }));
    expect(screen.getByText('Choose a destination category.')).toBeInTheDocument();
    expect(onDecision).not.toHaveBeenCalled();
  });

  it('accepts and skips reconcile cards', async () => {
    const onDecision = vi.fn();
    const onItemChange = vi.fn();
    const user = userEvent.setup();

    render(
      <OrderReconcileDeckPanel
        state={baseState()}
        deck={sampleDeck()}
        items={[reconcileItem({ destination_category: 'New Set In' })]}
        onDecision={onDecision}
        onItemChange={onItemChange}
        onCompleteDeck={vi.fn()}
        onStatus={vi.fn()}
      />,
    );

    await user.selectOptions(screen.getByRole('combobox'), 'New Set In');
    expect(onItemChange).toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Accept' }));
    expect(onDecision).toHaveBeenCalledWith(
      'item-1',
      expect.objectContaining({ status: 'accepted' }),
    );

    await user.click(screen.getByRole('button', { name: 'Skip' }));
    expect(onDecision).toHaveBeenCalledWith('item-1', { status: 'skipped' });
  });

  it('requires a cut for cube items before accept', async () => {
    const onDecision = vi.fn();
    const user = userEvent.setup();

    render(
      <OrderReconcileDeckPanel
        state={baseState()}
        deck={sampleDeck()}
        items={[
          reconcileItem({
            is_cube: true,
            paired_out: null,
            destination_category: 'White',
          }),
        ]}
        onDecision={onDecision}
        onItemChange={vi.fn()}
        onCompleteDeck={vi.fn()}
        onStatus={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Accept' }));
    expect(screen.getByText(/Choose a card to cut/i)).toBeInTheDocument();
    expect(onDecision).not.toHaveBeenCalled();
  });

  it('copies deck import when reconcile is complete', async () => {
    const onStatus = vi.fn();
    const user = userEvent.setup();
    const item = reconcileItem({ destination_category: 'New Set In' });
    const state = baseState({
      progress: {
        decisions: {
          'item-1': {
            status: 'accepted',
            accepted: {
              quantity: 1,
              destination_category: 'New Set In',
              card_in: { name: 'Sol Ring', set_code: 'cmm', collector_number: '1' },
              card_out: { name: 'Lightning Bolt' },
            },
          },
        },
      },
    });

    render(
      <OrderReconcileDeckPanel
        state={state}
        deck={sampleDeck()}
        items={[item]}
        onDecision={vi.fn()}
        onItemChange={vi.fn()}
        onCompleteDeck={vi.fn()}
        onStatus={onStatus}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Copy deck import' }));
    await waitFor(() => {
      expect(mockCopyText).toHaveBeenCalled();
      expect(onStatus).toHaveBeenCalledWith('Deck import copied.');
    });
  });

  it('applies deck via bridge when available', async () => {
    mockBridgeApplyAvailable.mockReturnValue(true);
    const onCompleteDeck = vi.fn();
    const onStatus = vi.fn();
    const user = userEvent.setup();
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const item = reconcileItem({ destination_category: 'New Set In' });
    const state = baseState({
      progress: {
        decisions: {
          'item-1': {
            status: 'accepted',
            accepted: {
              quantity: 1,
              destination_category: 'New Set In',
              card_in: { name: 'Sol Ring', set_code: 'cmm', collector_number: '1' },
              card_out: { name: 'Lightning Bolt' },
            },
          },
        },
      },
    });

    render(
      <OrderReconcileDeckPanel
        state={state}
        deck={sampleDeck()}
        items={[item]}
        onDecision={vi.fn()}
        onItemChange={vi.fn()}
        onCompleteDeck={onCompleteDeck}
        onStatus={onStatus}
      />,
    );

    await user.click(screen.getByRole('button', { name: /Confirm & apply/i }));
    expect(mockStageDeckApply).toHaveBeenCalled();
    expect(openSpy).toHaveBeenCalled();
    expect(onCompleteDeck).toHaveBeenCalled();
    openSpy.mockRestore();
  });
});

describe('OrderReconcileStaging', () => {
  it('copies staging import text', async () => {
    const onStatus = vi.fn();
    const user = userEvent.setup();
    const item = reconcileItem({ deck_id: STAGING_DECK_ID, destination_category: 'New Set In' });

    render(
      <OrderReconcileStaging
        state={baseState({
          reconcileItems: [item],
          progress: {
            decisions: {
              'item-1': {
                status: 'accepted',
                accepted: {
                  quantity: 1,
                  destination_category: 'New Set In',
                  card_in: { name: 'Sol Ring' },
                  card_out: null,
                },
              },
            },
          },
        })}
        onStatus={onStatus}
      />,
    );

    expect(screen.getByText(/Remove 1 accepted card/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Copy staging import' }));
    expect(mockCopyText).toHaveBeenCalled();
    expect(onStatus).toHaveBeenCalledWith('Staging import copied.');
  });

  it('applies staging deck via bridge when available', async () => {
    mockBridgeApplyAvailable.mockReturnValue(true);
    const onStatus = vi.fn();
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const user = userEvent.setup();

    render(
      <OrderReconcileStaging
        state={baseState({
          reconcileItems: [reconcileItem({ deck_id: STAGING_DECK_ID })],
        })}
        onStatus={onStatus}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Apply via bridge' }));
    expect(mockStageDeckApply).toHaveBeenCalled();
    expect(openSpy).toHaveBeenCalled();
    expect(onStatus).toHaveBeenCalledWith('Staged staging deck — apply on Archidekt tab.');
    openSpy.mockRestore();
  });
});
