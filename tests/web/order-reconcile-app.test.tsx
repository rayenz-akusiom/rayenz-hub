import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { STAGING_DECK_ID } from '../../packages/web/src/order-reconcile/types';
import { OrderReconcileApp } from '../../packages/web/src/order-reconcile/OrderReconcileApp';
import { resetHubModules } from '../unit/helpers/hubHarness';

const progressController = {
  start: vi.fn(),
  update: vi.fn(),
  finish: vi.fn(),
  dismiss: vi.fn(),
  isActive: vi.fn(() => false),
  isFinished: vi.fn(() => false),
};

vi.mock('../../packages/web/src/lib/hub-progress', () => ({
  HubProgress: { mount: vi.fn(() => progressController) },
}));

vi.mock('../../packages/web/src/lib/hub-storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../packages/web/src/lib/hub-storage')>();
  return {
    ...actual,
    loadOrderReconcileSettings: vi.fn(() => ({
      folderUrl: 'https://archidekt.com/folders/12345/my-folder',
      stagingDeckUrl: 'https://archidekt.com/decks/99999/staging',
    })),
    loadOrderReconcileProgress: vi.fn(() => ({ decisions: {} })),
    saveOrderReconcileProgress: vi.fn(),
  };
});

const mockFetchAllSnapshots = vi.fn();
const mockBuildAssignmentPlan = vi.fn();

vi.mock('../../packages/web/src/order-reconcile/data', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../packages/web/src/order-reconcile/data')>();
  return {
    ...actual,
    fetchAllSnapshots: (...args: unknown[]) => mockFetchAllSnapshots(...args),
  };
});

vi.mock('../../packages/web/src/order-reconcile/assign', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../packages/web/src/order-reconcile/assign')>();
  return {
    ...actual,
    buildAssignmentPlan: (...args: unknown[]) => mockBuildAssignmentPlan(...args),
  };
});

function mockDecks() {
  return {
    decks: [
      {
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
      },
    ],
    stagingDeck: {
      deck_id: STAGING_DECK_ID,
      deck_name: 'Buy / trade list',
      archidekt_url: 'https://archidekt.com/decks/99999/staging',
      deck_snapshot: {
        fetched_at: '2026-01-01',
        cards: [{ name: 'Shock', primary_category: 'New Set In', categories: ['New Set In'] }],
      },
    },
    assignmentIndex: {},
  };
}

function mockAssignmentPlan() {
  return {
    assignmentIndex: {},
    copies: [
      {
        copy_id: 'copy-1',
        acquired_id: 'acq-0',
        card_name: 'Sol Ring',
        set_code: 'cmm',
        collector_number: '1',
      },
    ],
    assignments: [
      {
        copy_id: 'copy-1',
        deck_id: 'deck-1',
        deck_name: 'Test Commander',
        slot_key: 'slot-1',
        card_name: 'Sol Ring',
        queued_in: { name: 'Sol Ring' },
        paired_out: { name: 'Lightning Bolt' },
        destination_category: 'New Set In',
        reason: 'matched',
      },
    ],
    needsReview: [],
    colorIdentityCache: {},
  };
}

beforeEach(() => {
  resetHubModules();
  window.scrollTo = vi.fn() as typeof window.scrollTo;
  vi.clearAllMocks();
  mockFetchAllSnapshots.mockResolvedValue(mockDecks());
  mockBuildAssignmentPlan.mockResolvedValue(mockAssignmentPlan());
});

afterEach(() => {
  cleanup();
  resetHubModules();
  document.body.innerHTML = '';
});

describe('OrderReconcileApp input phase', () => {
  it('renders input chrome with settings link and tabs', () => {
    render(<OrderReconcileApp />);

    expect(screen.getByRole('heading', { name: 'Order Reconcile' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.getByText(/Folder: https:\/\/archidekt.com\/folders/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open Order Reconcile settings/i })).toHaveAttribute(
      'href',
      '#/settings/order-reconcile',
    );
    expect(screen.getByRole('button', { name: 'Card list' })).toHaveClass('active');
    expect(screen.getByRole('button', { name: /Order email/i })).toBeInTheDocument();
    expect(screen.getByText('No cards parsed yet.')).toBeInTheDocument();
  });

  it('shows continue error when no cards are parsed', async () => {
    const user = userEvent.setup();
    render(<OrderReconcileApp />);

    await user.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => {
      expect(screen.getByText('Parse at least one acquired card first.')).toBeInTheDocument();
    });
  });

  it('parses card list text into the acquired table', async () => {
    const user = userEvent.setup();
    render(<OrderReconcileApp />);

    const textarea = screen.getAllByRole('textbox')[0];
    await user.type(textarea, '1x Sol Ring (cmm) 1');
    await user.click(screen.getByRole('button', { name: 'Parse cards' }));

    await waitFor(() => {
      expect(screen.getByDisplayValue('Sol Ring')).toBeInTheDocument();
    });
    expect(screen.queryByText('No cards parsed yet.')).not.toBeInTheDocument();
  });

  it('switches to order email input mode', async () => {
    const user = userEvent.setup();
    render(<OrderReconcileApp />);

    await user.click(screen.getByRole('button', { name: /Order email/i }));
    expect(screen.getByPlaceholderText(/Paste order confirmation email body/i)).toBeInTheDocument();
  });
});

describe('OrderReconcileApp assign phase', () => {
  async function continueToAssign(user: ReturnType<typeof userEvent.setup>) {
    render(<OrderReconcileApp />);
    const textarea = screen.getAllByRole('textbox')[0];
    await user.clear(textarea);
    await user.type(textarea, '1 Sol Ring (cmm) 1');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Assign copies to decks' })).toBeInTheDocument();
    });
  }

  it('advances to assign panel after continue', async () => {
    const user = userEvent.setup();
    await continueToAssign(user);

    expect(screen.getByText(/1 auto-assigned · 0 optional assignment/i)).toBeInTheDocument();
    expect(screen.getByText('All copies assigned automatically.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Disambiguate/i })).toBeInTheDocument();
  });

  it('opens session nav drawer and supports new session', async () => {
    const user = userEvent.setup();
    await continueToAssign(user);

    const nav = document.getElementById('or-right-nav')!;
    expect(nav).not.toHaveClass('open');

    await user.click(screen.getByRole('button', { name: 'Open menu' }));
    expect(nav).toHaveClass('open');

    await user.click(screen.getByRole('button', { name: 'New session' }));
    await waitFor(() => {
      expect(screen.getByText('No cards parsed yet.')).toBeInTheDocument();
    });
  });
});

describe('OrderReconcileApp deck and staging panels', () => {
  it('starts reconcile on the deck panel with summary section', async () => {
    const user = userEvent.setup();
    render(<OrderReconcileApp />);

    await user.type(screen.getAllByRole('textbox')[0], '1 Sol Ring (cmm) 1');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => screen.getByRole('button', { name: 'Start reconcile' }));

    await user.click(screen.getByRole('button', { name: 'Start reconcile' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Test Commander' })).toBeInTheDocument();
    });
    expect(document.querySelector('.or-summary-section')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy deck import' })).toBeInTheDocument();
  });

  it('shows staging cleanup panel from deck nav', async () => {
    const user = userEvent.setup();
    render(<OrderReconcileApp />);

    await user.type(screen.getAllByRole('textbox')[0], '1 Sol Ring (cmm) 1');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => screen.getByRole('button', { name: 'Start reconcile' }));
    await user.click(screen.getByRole('button', { name: 'Start reconcile' }));
    await waitFor(() => screen.getByRole('heading', { name: 'Test Commander' }));

    await user.click(screen.getByRole('button', { name: 'Buy/trade list' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Buy/trade list cleanup' })).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Copy staging import' })).toBeInTheDocument();
  });
});
