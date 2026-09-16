import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OrderReconcileApp } from '../../packages/web/src/order-reconcile/OrderReconcileApp';
import { resetHubModules } from '../unit/helpers/hubHarness';

vi.mock('../../packages/web/src/lib/hub-progress', async () => {
  const { hubProgressMockModule } = await import('./helpers/hub-progress-mock');
  return hubProgressMockModule();
});

vi.mock('../../packages/web/src/lib/hub-storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../packages/web/src/lib/hub-storage')>();
  return {
    ...actual,
    loadOrderReconcileSettings: vi.fn(() => ({})),
    loadOrderReconcileProgress: vi.fn(() => ({ decisions: {} })),
    saveOrderReconcileProgress: vi.fn(),
  };
});

const mockLoadHubLibrarySnapshots = vi.fn();
const mockBuildAssignmentPlan = vi.fn();
const mockLoadCollectionDecks = vi.fn();
const mockPersistCollectionDecks = vi.fn();

vi.mock('../../packages/web/src/order-reconcile/data', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../packages/web/src/order-reconcile/data')>();
  return {
    ...actual,
    loadHubLibrarySnapshots: (...args: unknown[]) => mockLoadHubLibrarySnapshots(...args),
  };
});

vi.mock('../../packages/web/src/order-reconcile/assign', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../packages/web/src/order-reconcile/assign')>();
  return {
    ...actual,
    buildAssignmentPlan: (...args: unknown[]) => mockBuildAssignmentPlan(...args),
  };
});

vi.mock('../../packages/web/src/order-reconcile/collection-mark', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../packages/web/src/order-reconcile/collection-mark')>();
  return {
    ...actual,
    loadCollectionDecks: (...args: unknown[]) => mockLoadCollectionDecks(...args),
    persistCollectionDecks: (...args: unknown[]) => mockPersistCollectionDecks(...args),
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
            { name: 'Sol Ring', primary_category: 'Queued In', categories: ['Queued In'] },
            { name: 'Lightning Bolt', primary_category: 'Ramp', categories: ['Ramp'] },
          ],
        },
      },
    ],
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
        destination_category: 'Queued In',
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
  mockLoadHubLibrarySnapshots.mockResolvedValue(mockDecks());
  mockBuildAssignmentPlan.mockResolvedValue(mockAssignmentPlan());
  mockLoadCollectionDecks.mockResolvedValue([]);
  mockPersistCollectionDecks.mockImplementation(async (docs: unknown[]) => ({
    saved: docs,
    errors: [],
  }));
});

afterEach(() => {
  cleanup();
  resetHubModules();
  document.body.innerHTML = '';
});

describe('OrderReconcileApp input phase', () => {
  it('renders input chrome with tabs', () => {
    render(<OrderReconcileApp />);

    expect(screen.getByRole('heading', { name: 'Order Reconcile' })).toBeInTheDocument();
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

describe('OrderReconcileApp collection phase', () => {
  async function continueToCollection(user: ReturnType<typeof userEvent.setup>) {
    render(<OrderReconcileApp />);
    const textarea = screen.getAllByRole('textbox')[0];
    await user.clear(textarea);
    await user.type(textarea, '1 Sol Ring (cmm) 1');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Mark collection binders' })).toBeInTheDocument();
    });
  }

  it('advances to collection panel after continue', async () => {
    const user = userEvent.setup();
    await continueToCollection(user);

    expect(screen.getByText(/No collection binders in the Hub library/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Collection/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue to decks' })).toBeInTheDocument();
  });

  it('toggles apply mode when binders have matches', async () => {
    const user = userEvent.setup();
    mockLoadCollectionDecks.mockResolvedValue([
      {
        schemaVersion: 2,
        deckId: 'col-1',
        name: 'Planeswalkers',
        format: 'collection',
        ownership: 'owned',
        visibility: 'private',
        description: '',
        archidektId: null,
        archidektUrl: null,
        categories: [],
        cards: [
          {
            instanceId: 'c1',
            name: 'Sol Ring',
            quantity: 1,
            ownedQuantity: 0,
            inDeckQuantity: 0,
            primaryCategory: 'Collection',
            categories: ['Collection', 'Seeking'],
            stack: null,
            setCode: 'cmm',
            collectorNumber: '1',
            scryfallId: null,
            archidektCardId: null,
            foil: false,
            proxy: false,
            collectionSource: 'search',
          },
        ],
        oracle: {},
        formalSwapEntries: [],
        lookingForEntries: [],
        coverInstanceId: null,
        browseViewDefault: 'all_cards',
        cardLayoutDefault: 'grid',
        cardSortDefault: 'name_asc',
        createdAt: '2026-09-15T00:00:00.000Z',
        updatedAt: '2026-09-15T00:00:00.000Z',
        lastArchidektSyncAt: null,
        lastArchidektImportAt: null,
        cubeTargetSize: null,
        collectionTemplate: null,
        collectionSearch: null,
        representativeCard: null,
        autoAdjustBasics: false,
      },
    ]);

    await continueToCollection(user);

    expect(screen.getByRole('button', { name: 'Mark exact matches' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'All binders' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: 'One copy each' }));
    expect(screen.getByRole('button', { name: 'One copy each' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/fills at most one binder slot/i)).toBeInTheDocument();
  });

  it('continues from collection to assign', async () => {
    const user = userEvent.setup();
    await continueToCollection(user);

    await user.click(screen.getByRole('button', { name: 'Continue to decks' }));
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Assign copies to decks' })).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /Disambiguate/i })).toBeInTheDocument();
  });

  it('marks exact matches and updates status', async () => {
    const user = userEvent.setup();
    mockLoadCollectionDecks.mockResolvedValue([
      {
        schemaVersion: 2,
        deckId: 'col-1',
        name: 'Planeswalkers',
        format: 'collection',
        ownership: 'owned',
        visibility: 'private',
        description: '',
        archidektId: null,
        archidektUrl: null,
        categories: [],
        cards: [
          {
            instanceId: 'c1',
            name: 'Sol Ring',
            quantity: 1,
            ownedQuantity: 0,
            inDeckQuantity: 0,
            primaryCategory: 'Collection',
            categories: ['Collection', 'Seeking'],
            stack: null,
            setCode: 'cmm',
            collectorNumber: '1',
            scryfallId: null,
            archidektCardId: null,
            foil: false,
            proxy: false,
            collectionSource: 'search',
          },
        ],
        oracle: {},
        formalSwapEntries: [],
        lookingForEntries: [],
        coverInstanceId: null,
        browseViewDefault: 'all_cards',
        cardLayoutDefault: 'grid',
        cardSortDefault: 'name_asc',
        createdAt: '2026-09-15T00:00:00.000Z',
        updatedAt: '2026-09-15T00:00:00.000Z',
        lastArchidektSyncAt: null,
        lastArchidektImportAt: null,
        cubeTargetSize: null,
        collectionTemplate: null,
        collectionSearch: null,
        representativeCard: null,
        autoAdjustBasics: false,
      },
    ]);

    await continueToCollection(user);
    await user.click(screen.getByRole('button', { name: 'Mark exact matches' }));

    await waitFor(() => {
      expect(mockPersistCollectionDecks).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(screen.getByText(/Marked 1 exact collection match/i)).toBeInTheDocument();
    });
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
      expect(screen.getByRole('heading', { name: 'Mark collection binders' })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: 'Continue to decks' }));
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

    await user.click(screen.getByRole('button', { name: 'Decks' }));
    expect(nav).toHaveClass('open');

    await user.click(screen.getByRole('button', { name: 'New session' }));
    await waitFor(() => {
      expect(screen.getByText('No cards parsed yet.')).toBeInTheDocument();
    });
  });
});

describe('OrderReconcileApp deck panel', () => {
  it('starts reconcile on the deck panel with summary section', async () => {
    const user = userEvent.setup();
    render(<OrderReconcileApp />);

    await user.type(screen.getAllByRole('textbox')[0], '1 Sol Ring (cmm) 1');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    await waitFor(() => screen.getByRole('button', { name: 'Continue to decks' }));
    await user.click(screen.getByRole('button', { name: 'Continue to decks' }));
    await waitFor(() => screen.getByRole('button', { name: 'Start reconcile' }));

    await user.click(screen.getByRole('button', { name: 'Start reconcile' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Test Commander' })).toBeInTheDocument();
    });
    expect(document.querySelector('.or-summary-section')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy deck import' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save to Hub' })).toBeInTheDocument();
  });
});
