import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { saveReviewHandoff } from '../../packages/web/src/lib/hub-storage';
import { DeckReviewApp } from '../../packages/web/src/deck-review/DeckReviewApp';
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

vi.mock('../../packages/web/src/deck-review/profiles', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../packages/web/src/deck-review/profiles')>();
  return {
    ...actual,
    checkProfilesConnected: vi.fn(() => Promise.resolve(false)),
    connectProfilesDir: vi.fn(() => Promise.resolve()),
  };
});

vi.mock('../../packages/web/src/deck-review/archidekt-bridge', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../packages/web/src/deck-review/archidekt-bridge')>();
  return {
    ...actual,
    bridgeAvailable: vi.fn(() => false),
    bridgeApplyAvailable: vi.fn(() => false),
    refreshAllDeckSnapshots: vi.fn(() => Promise.resolve()),
    refreshActiveDeckSnapshot: vi.fn(() => Promise.resolve()),
  };
});

vi.mock('../../packages/web/src/lib/hub-storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../packages/web/src/lib/hub-storage')>();
  return {
    ...actual,
    hydrateReviewProgressFromApi: vi.fn(async () => ({
      decisions: {},
      currentDeckId: null,
      currentSuggestionIndex: {},
    })),
  };
});

function handoffPayload() {
  return {
    meta: {
      schema_version: '1.1',
      set_code: 'MSH',
      set_name: 'Marvel Super Heroes',
      generated_at: '2026-06-21',
    },
    decks: [
      {
        deck_id: 'baird',
        deck_name: 'Baird',
        archidekt_url: 'https://archidekt.com/decks/3533613',
        suggestions: [
          {
            suggestion_id: 's1',
            priority_tier: 'swap',
            confidence: 'high',
            action: 'replace',
            card: { name: "Caretaker's Talent", set_code: 'BLB', collector_number: '6' },
            replaces: [{ name: 'Plains' }],
            roles_matched: ['ramp'],
            rationale: 'Upgrade path',
          },
        ],
        deck_snapshot: {
          fetched_at: '2026-06-22',
          cards: [
            { name: 'Plains', primary_category: 'New Set Out', categories: ['New Set Out'] },
            { name: "Caretaker's Talent", primary_category: 'New Set In', categories: ['New Set In'] },
            { name: 'Sol Ring', primary_category: 'Ramp', categories: ['Ramp'] },
          ],
        },
      },
    ],
  };
}

beforeEach(() => {
  resetHubModules();
  vi.clearAllMocks();
  delete (window as Window & { RayenzArchidektBridge?: unknown }).RayenzArchidektBridge;
});

afterEach(() => {
  cleanup();
  resetHubModules();
  document.body.innerHTML = '';
});

describe('DeckReviewApp empty state', () => {
  it('shows empty guidance and sidebar data actions', () => {
    render(<DeckReviewApp />);

    expect(screen.getByRole('heading', { name: 'Deck Review' })).toBeInTheDocument();
    expect(screen.getByText(/Upload a suggestions JSON file/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh latest' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upload JSON' })).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Deck navigation' })).toBeInTheDocument();
  });

  it('reports fetch error when Refresh latest fails', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({}),
    } as Response);

    const user = userEvent.setup();
    render(<DeckReviewApp />);
    await user.click(screen.getByRole('button', { name: 'Refresh latest' }));

    await waitFor(() => {
      expect(screen.getByText(/Could not fetch data\/suggestions\/latest.json/i)).toBeInTheDocument();
    });
    fetchSpy.mockRestore();
  });
});

describe('DeckReviewApp handoff and sidebar', () => {
  it('loads deck-suggest handoff without fetching latest.json', async () => {
    saveReviewHandoff({
      data: handoffPayload(),
      source: 'deck-suggest',
      savedAt: '2026-06-30T12:00:00.000Z',
    });
    const fetchSpy = vi.fn(async () => ({
      ok: false,
      status: 404,
      json: () => Promise.resolve({}),
    }));
    global.fetch = fetchSpy;

    render(<DeckReviewApp />);

    await waitFor(() => {
      expect(document.getElementById('dr-content')).toBeTruthy();
    });

    const latestCalls = fetchSpy.mock.calls.filter((call) => String(call[0]).indexOf('latest.json') >= 0);
    expect(latestCalls).toHaveLength(0);
    expect(screen.getByText(/Marvel Super Heroes/i)).toBeInTheDocument();
    expect(screen.getByText(/Transferred from Deck Suggest/i)).toBeInTheDocument();
  });

  it('shows deck-suggest handoff controls in the sidebar', async () => {
    saveReviewHandoff({
      data: handoffPayload(),
      source: 'deck-suggest',
      savedAt: '2026-06-30T12:00:00.000Z',
    });

    render(<DeckReviewApp />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Download JSON' })).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Refresh from Archidekt (optional)' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Baird/i })).toBeInTheDocument();
  });

  it('opens and closes the deck navigation drawer', async () => {
    saveReviewHandoff({
      data: handoffPayload(),
      source: 'deck-suggest',
      savedAt: '2026-06-30T12:00:00.000Z',
    });

    const user = userEvent.setup();
    render(<DeckReviewApp />);

    await waitFor(() => expect(screen.getByRole('button', { name: /Baird/i })).toBeInTheDocument());

    const nav = screen.getByRole('complementary', { name: 'Deck navigation' });
    expect(nav).not.toHaveClass('open');

    await user.click(screen.getByRole('button', { name: 'Open deck menu' }));
    expect(nav).toHaveClass('open');

    await user.click(document.getElementById('dr-right-nav-backdrop')!);
    expect(nav).not.toHaveClass('open');
  });
});

describe('DeckReviewApp suggestion panel', () => {
  it('renders suggestion cards and status toolbar for active deck', async () => {
    saveReviewHandoff({
      data: handoffPayload(),
      source: 'deck-suggest',
      savedAt: '2026-06-30T12:00:00.000Z',
    });

    render(<DeckReviewApp />);

    await waitFor(() => {
      expect(screen.getByRole('link', { name: /Open Baird on Archidekt/i })).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Show all' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: "Caretaker's Talent" })).toBeInTheDocument();
  });

  it('accepts a suggestion and reaches the reviewed empty state', async () => {
    saveReviewHandoff({
      data: handoffPayload(),
      source: 'deck-suggest',
      savedAt: '2026-06-30T12:00:00.000Z',
    });

    const user = userEvent.setup();
    render(<DeckReviewApp />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: "Caretaker's Talent" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Accept' }));
    await waitFor(() => {
      expect(screen.getByText(/All suggestions reviewed for Baird/i)).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Show all' }));
    await waitFor(() => {
      expect(document.getElementById('dr-suggestions-all')).toBeInTheDocument();
    });
    expect(screen.getAllByText('Accepted').length).toBeGreaterThan(0);
  });

  it('skips and rejects suggestions from the action bar', async () => {
    saveReviewHandoff({
      data: handoffPayload(),
      source: 'deck-suggest',
      savedAt: '2026-06-30T12:00:00.000Z',
    });

    const user = userEvent.setup();
    render(<DeckReviewApp />);

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: "Caretaker's Talent" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Skip' }));
    await waitFor(() => {
      expect(screen.getAllByText('Skipped').length).toBeGreaterThan(0);
    });

    await user.click(screen.getByRole('button', { name: 'Show all' }));
    await waitFor(() => {
      expect(document.getElementById('dr-suggestions-all')).toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Reject' }));
    expect(screen.getAllByText('Rejected').length).toBeGreaterThan(0);
  });

  it('switches status card tabs and shows queue/update panes', async () => {
    saveReviewHandoff({
      data: handoffPayload(),
      source: 'deck-suggest',
      savedAt: '2026-06-30T12:00:00.000Z',
    });

    const user = userEvent.setup();
    render(<DeckReviewApp />);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Decisions' })).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Archidekt queue' }));
    expect(screen.getAllByText(/From Deck Suggest/i).length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: 'Update' }));
    expect(screen.getByText(/Review all suggestions first/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Decisions' }));
    expect(screen.getByText(/1\/1 reviewed|0\/1 reviewed/i)).toBeInTheDocument();
  });

  it('switches to a deck with no suggestions from the sidebar', async () => {
    const data = handoffPayload();
    data.decks.push({
      deck_id: 'second',
      deck_name: 'Second Deck',
      archidekt_url: 'https://archidekt.com/decks/99999/second',
      suggestions: [],
      deck_snapshot: { fetched_at: '2026-06-22', cards: [] },
    });

    saveReviewHandoff({
      data,
      source: 'upload',
      savedAt: '2026-06-30T12:00:00.000Z',
    });

    const user = userEvent.setup();
    render(<DeckReviewApp />);

    await waitFor(() => expect(screen.getByRole('button', { name: /Baird/i })).toBeInTheDocument());

    const deckList = document.getElementById('dr-deck-list')!;
    await user.click(within(deckList).getByText('No suggestions (1)'));
    await user.click(within(deckList).getByRole('button', { name: /Second Deck/i }));

    await waitFor(() => {
      expect(screen.getByText('All suggestions reviewed for Second Deck.')).toBeInTheDocument();
    });
  });
});
