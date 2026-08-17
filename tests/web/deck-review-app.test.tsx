import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DeckSuggestApp } from '../../packages/web/src/deck-suggest/DeckSuggestApp';
import { DeckReviewStatusCard } from '../../packages/web/src/deck-review/DeckReviewStatusCard';
import { ArchidektExport } from '../../packages/web/src/mtg/archidekt-export';
import * as archidektBridge from '../../packages/web/src/deck-review/archidekt-bridge';
import { resetHubModules } from '../unit/helpers/hubHarness';

vi.mock('../../packages/web/src/lib/hub-progress', async () => {
  const { hubProgressMockModule } = await import('./helpers/hub-progress-mock');
  return hubProgressMockModule();
});

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
    loadDeckSuggestSettings: vi.fn(() => ({
      setCodes: '',
      releaseId: '',
      setInputMode: 'release',
    })),
    saveDeckSuggestSettings: vi.fn(),
  };
});

vi.mock('../../packages/web/src/deck-suggest/data', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../packages/web/src/deck-suggest/data')>();
  return {
    ...actual,
    loadHubLibraryDecks: vi.fn(() => Promise.resolve([])),
  };
});

vi.mock('../../packages/web/src/api/hub-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../packages/web/src/api/hub-api')>();
  return {
    ...actual,
    isApiConfigured: () => false,
  };
});

async function loadSuggestionsViaUpload(payload: ReturnType<typeof handoffPayload>) {
  const user = userEvent.setup();
  render(<DeckSuggestApp />);
  const file = new File([JSON.stringify(payload)], 'suggestions.json', { type: 'application/json' });
  const input = document.getElementById('dr-file-input') as HTMLInputElement;
  await user.upload(input, file);
  await waitFor(() => {
    expect(document.getElementById('dr-content')).toBeTruthy();
  });
  return user;
}

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
            { name: 'Plains', primary_category: 'Queued Out', categories: ['Queued Out'] },
            { name: "Caretaker's Talent", primary_category: 'Queued In', categories: ['Queued In'] },
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
  sessionStorage.clear();
  delete (window as Window & { RayenzArchidektBridge?: unknown }).RayenzArchidektBridge;
});

afterEach(() => {
  cleanup();
  resetHubModules();
  document.body.innerHTML = '';
});

describe('DeckSuggestApp empty state', () => {
  it('shows empty guidance and sidebar data actions', () => {
    render(<DeckSuggestApp />);

    expect(screen.getByRole('heading', { name: 'Deck Suggest' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Generate' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Refresh latest' }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button', { name: 'Upload JSON' }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('complementary', { name: 'Deck navigation' })).toBeInTheDocument();
  });

  it('reports fetch error when Refresh latest fails', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({}),
    } as Response);

    const user = userEvent.setup();
    render(<DeckSuggestApp />);
    await user.click(screen.getAllByRole('button', { name: 'Refresh latest' })[0]);

    await waitFor(() => {
      expect(screen.getByText(/Could not fetch data\/suggestions\/latest.json/i)).toBeInTheDocument();
    });
    fetchSpy.mockRestore();
  });
});

describe('DeckSuggestApp upload and sidebar', () => {
  it('loads uploaded suggestions JSON without fetching latest.json', async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: false,
      status: 404,
      json: () => Promise.resolve({}),
    }));
    global.fetch = fetchSpy;

    await loadSuggestionsViaUpload(handoffPayload());

    const latestCalls = fetchSpy.mock.calls.filter((call) => String(call[0]).indexOf('latest.json') >= 0);
    expect(latestCalls).toHaveLength(0);
    expect(screen.getByText(/Marvel Super Heroes/i)).toBeInTheDocument();
  });

  it('shows upload-source controls in the sidebar', async () => {
    await loadSuggestionsViaUpload(handoffPayload());
    expect(screen.getByRole('button', { name: 'Download JSON' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh all decks' })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Baird/i })).toBeInTheDocument();
  });

  it('opens and closes the deck navigation drawer', async () => {
    const user = await loadSuggestionsViaUpload(handoffPayload());

    const nav = screen.getByRole('complementary', { name: 'Deck navigation' });
    expect(nav).not.toHaveClass('open');

    await user.click(screen.getByRole('button', { name: 'Decks' }));
    expect(nav).toHaveClass('open');

    await user.click(document.getElementById('dr-right-nav-backdrop')!);
    expect(nav).not.toHaveClass('open');
  });
});

describe('DeckSuggestApp suggestion panel', () => {
  it('renders suggestion cards and status toolbar for active deck', async () => {
    await loadSuggestionsViaUpload(handoffPayload());

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Archidekt' })).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Show all' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: "Caretaker's Talent" })).toBeInTheDocument();
  });

  it('accepts a suggestion and reaches the reviewed empty state', async () => {
    const user = await loadSuggestionsViaUpload(handoffPayload());

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
    const user = await loadSuggestionsViaUpload(handoffPayload());

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
    const user = await loadSuggestionsViaUpload(handoffPayload());

    await waitFor(() => expect(screen.getByRole('button', { name: /Open status/i })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /Open status/i }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Decisions' })).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Archidekt queue' }));
    expect(screen.getAllByText(/From Archidekt/i).length).toBeGreaterThan(0);

    await user.click(screen.getByRole('button', { name: 'Update' }));
    expect(screen.getByText(/Review all suggestions first/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Decisions' }));
    expect(screen.getByText(/1\/1 reviewed|0\/1 reviewed/i)).toBeInTheDocument();
  });

  it('keeps status collapsed by default and expands from the summary', async () => {
    const user = await loadSuggestionsViaUpload(handoffPayload());

    await waitFor(() => expect(screen.getByRole('button', { name: /Open status/i })).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Decisions' })).not.toBeInTheDocument();
    expect(screen.getByText(/1 pending/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Open queue/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Archidekt queue' })).toHaveClass('active'));
    expect(screen.getAllByText(/From Archidekt/i).length).toBeGreaterThan(0);
  });

  it('shows a denser show-all grid of compact suggestion tiles', async () => {
    const data = handoffPayload();
    data.decks[0].suggestions.push({
      suggestion_id: 's2',
      priority_tier: 'upgrade',
      confidence: 'medium',
      action: 'add',
      card: { name: 'Sol Ring', set_code: 'C21', collector_number: '1' },
      replaces: [],
      roles_matched: ['ramp'],
      rationale: 'Staple ramp',
    });

    const user = await loadSuggestionsViaUpload(data);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Show all' })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Show all' }));

    const grid = await waitFor(() => document.getElementById('dr-suggestions-all'));
    expect(grid).toBeInTheDocument();
    expect(grid?.querySelectorAll('.dr-suggestion-compact').length).toBe(2);
    expect(screen.getAllByRole('button', { name: 'Show details' }).length).toBe(2);

    await user.click(screen.getAllByRole('button', { name: 'Show details' })[0]);
    expect(screen.getByText('Upgrade path')).toBeInTheDocument();
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

    const user = await loadSuggestionsViaUpload(data);

    await waitFor(() => expect(screen.getByRole('button', { name: /Baird/i })).toBeInTheDocument());

    const deckList = document.getElementById('dr-deck-list')!;
    await user.click(within(deckList).getByText('No suggestions (1)'));
    await user.click(within(deckList).getByRole('button', { name: /Second Deck/i }));

    await waitFor(() => {
      expect(screen.getByText('All suggestions reviewed for Second Deck.')).toBeInTheDocument();
    });
  });
});

describe('DeckReviewStatusCard panes', () => {
  const emptyProgress = { decisions: {}, currentDeckId: null, currentSuggestionIndex: {} };
  const suggestion = {
    suggestion_id: 's1',
    card: { name: 'New Card', set_code: 'MSH', collector_number: '1' },
    replaces: [{ name: 'Old Card', set_code: 'CMM', collector_number: '2' }],
    action: 'replace',
  };

  function deck(overrides: Record<string, unknown> = {}) {
    return {
      deck_id: 'd1',
      deck_name: 'Test Deck',
      archidekt_url: 'https://archidekt.com/decks/1',
      suggestions: [suggestion],
      ...overrides,
    };
  }

  beforeEach(() => {
    sessionStorage.setItem('dr-status-expanded', '0');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows skipped counts and empty-suggestion decisions', () => {
    sessionStorage.setItem('dr-status-expanded', '1');
    render(
      <DeckReviewStatusCard
        deck={deck({ suggestions: [] })}
        progress={emptyProgress}
        deckPrefs={{}}
        statusCardTab="decisions"
        transferSource="upload"
        onTabChange={vi.fn()}
        onRefreshDeck={vi.fn()}
        onApplyStaged={vi.fn()}
        onError={vi.fn()}
      />,
    );
    expect(screen.getByText(/No suggestions for this deck/i)).toBeInTheDocument();
    expect(screen.getByText(/0 pending/i)).toBeInTheDocument();
  });

  it('renders decision recap thumbs and skipped status', () => {
    sessionStorage.setItem('dr-status-expanded', '1');
    const accepted = {
      ...suggestion,
      suggestion_id: 's-acc',
      card: { name: 'In Card', scryfall_id: 'abc-123' },
      replaces: [{ name: 'Out Card', scryfall_id: 'def-456' }],
    };
    const skipped = { ...suggestion, suggestion_id: 's-skip', card: { name: 'Skip Me' }, replaces: [] };
    const rejected = { ...suggestion, suggestion_id: 's-rej', card: { name: 'Reject Me' }, replaces: [{ name: 'Cut' }] };
    const named = {
      ...suggestion,
      suggestion_id: 's-name',
      card: { name: 'Named Only' },
      replaces: [{ name: 'Cut Me' }],
    };
    render(
      <DeckReviewStatusCard
        deck={deck({ suggestions: [accepted, skipped, named, rejected] })}
        progress={{
          decisions: {
            's-acc': {
              status: 'accepted',
              accepted: {
                card_in: { name: 'In Card', scryfall_id: 'abc-123' },
                card_out: { name: 'Out Card', set_code: 'CMM', collector_number: '1' },
              },
            },
            's-skip': { status: 'skipped' },
            's-rej': { status: 'rejected' },
          },
          currentDeckId: null,
          currentSuggestionIndex: {},
        }}
        deckPrefs={{}}
        statusCardTab="decisions"
        transferSource="upload"
        onTabChange={vi.fn()}
        onRefreshDeck={vi.fn()}
        onApplyStaged={vi.fn()}
        onError={vi.fn()}
      />,
    );
    expect(screen.getByText(/1 skipped/i)).toBeInTheDocument();
    expect(screen.getByText(/1 rejected/i)).toBeInTheDocument();
    expect(screen.getByText('In Card')).toBeInTheDocument();
    expect(screen.getByText(/pick cut/i)).toBeInTheDocument();
  });

  it('queue pane explains missing snapshots for suggest vs upload', () => {
    sessionStorage.setItem('dr-status-expanded', '1');
    const { rerender } = render(
      <DeckReviewStatusCard
        deck={deck({ deck_snapshot: undefined, archidekt_url: '' })}
        progress={emptyProgress}
        deckPrefs={{}}
        statusCardTab="queue"
        transferSource="deck-suggest"
        onTabChange={vi.fn()}
        onRefreshDeck={vi.fn()}
        onApplyStaged={vi.fn()}
        onError={vi.fn()}
      />,
    );
    expect(screen.getByText(/Snapshot missing from generation/i)).toBeInTheDocument();

    rerender(
      <DeckReviewStatusCard
        deck={deck({ deck_snapshot: undefined })}
        progress={emptyProgress}
        deckPrefs={{}}
        statusCardTab="queue"
        transferSource="upload"
        onTabChange={vi.fn()}
        onRefreshDeck={vi.fn()}
        onApplyStaged={vi.fn()}
        onError={vi.fn()}
      />,
    );
    expect(screen.getByText(/No Archidekt snapshot/i)).toBeInTheDocument();
  });

  it('queue pane shows uncovered names, flags, and refresh when bridged', () => {
    sessionStorage.setItem('dr-status-expanded', '1');
    vi.mocked(archidektBridge.bridgeAvailable).mockReturnValue(true);
    const onRefreshDeck = vi.fn();
    render(
      <DeckReviewStatusCard
        deck={deck({
          deck_snapshot: {
            fetched_at: '2026-06-22',
            cards: [
              { name: 'Queued In', primary_category: 'Queued In', categories: ['Queued In'] },
              { name: 'Solo Out', primary_category: 'Queued Out', categories: ['Queued Out'] },
              { name: 'Flag Card', primary_category: 'Ramp', categories: ['Ramp', 'Queued In'] },
            ],
          },
        })}
        progress={emptyProgress}
        deckPrefs={{}}
        statusCardTab="queue"
        transferSource="deck-suggest"
        onTabChange={vi.fn()}
        onRefreshDeck={onRefreshDeck}
        onApplyStaged={vi.fn()}
        onError={vi.fn()}
      />,
    );
    expect(screen.getByText(/From generation/i)).toBeInTheDocument();
    expect(screen.getByText(/No suggestion yet/i)).toBeInTheDocument();
    expect(screen.getByText(/Flag Card \(primary: Ramp\)/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(onRefreshDeck).toHaveBeenCalled();
  });

  it('queue pane reports no swap queue when snapshot cards are missing', () => {
    sessionStorage.setItem('dr-status-expanded', '1');
    render(
      <DeckReviewStatusCard
        deck={deck({
          deck_snapshot: { fetched_at: '2026-06-22' },
        })}
        progress={emptyProgress}
        deckPrefs={{}}
        statusCardTab="queue"
        transferSource="upload"
        onTabChange={vi.fn()}
        onRefreshDeck={vi.fn()}
        onApplyStaged={vi.fn()}
        onError={vi.fn()}
      />,
    );
    expect(screen.getByText(/No swap queue on this deck/i)).toBeInTheDocument();
  });

  it('queue pane shows the bridge install hint when a queue exists without the userscript', () => {
    sessionStorage.setItem('dr-status-expanded', '1');
    vi.mocked(archidektBridge.bridgeAvailable).mockReturnValue(false);
    render(
      <DeckReviewStatusCard
        deck={deck({
          deck_snapshot: {
            fetched_at: '2026-06-22',
            cards: [
              { name: 'Queued In', primary_category: 'Queued In', categories: ['Queued In'] },
            ],
          },
        })}
        progress={emptyProgress}
        deckPrefs={{}}
        statusCardTab="queue"
        transferSource="upload"
        onTabChange={vi.fn()}
        onRefreshDeck={vi.fn()}
        onApplyStaged={vi.fn()}
        onError={vi.fn()}
      />,
    );
    expect(screen.getByText(/From Archidekt/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Archidekt Deck Review Bridge/i })).toBeInTheDocument();
  });

  it('queue pane shows empty in/out placeholders', () => {
    sessionStorage.setItem('dr-status-expanded', '1');
    render(
      <DeckReviewStatusCard
        deck={deck({
          deck_snapshot: { fetched_at: '2026-06-22', cards: [] },
        })}
        progress={emptyProgress}
        deckPrefs={{}}
        statusCardTab="queue"
        transferSource="upload"
        onTabChange={vi.fn()}
        onRefreshDeck={vi.fn()}
        onApplyStaged={vi.fn()}
        onError={vi.fn()}
      />,
    );
    expect(screen.getAllByText('empty').length).toBeGreaterThan(0);
  });

  it('update pane copies import text and reports bridge apply errors', async () => {
    sessionStorage.setItem('dr-status-expanded', '1');
    vi.spyOn(ArchidektExport, 'deckReviewComplete').mockReturnValue({
      complete: true,
      reviewed: 1,
      total: 1,
    } as never);
    vi.spyOn(ArchidektExport, 'buildFullDeckImport').mockReturnValue('1 Sol Ring');
    vi.spyOn(ArchidektExport, 'copyText').mockResolvedValue(undefined as never);
    vi.mocked(archidektBridge.bridgeApplyAvailable).mockReturnValue(true);
    vi.spyOn(archidektBridge, 'stageDeckApply').mockReturnValue({ error: 'staged fail' });
    const onApplyStaged = vi.fn();
    const onError = vi.fn();
    render(
      <DeckReviewStatusCard
        deck={deck({
          deck_snapshot: { fetched_at: '2026-06-22', cards: [{ name: 'Sol Ring' }] },
        })}
        progress={{
          decisions: { s1: { status: 'accepted' } },
          currentDeckId: null,
          currentSuggestionIndex: {},
        }}
        deckPrefs={{}}
        statusCardTab="update"
        transferSource="upload"
        onTabChange={vi.fn()}
        onRefreshDeck={vi.fn()}
        onApplyStaged={onApplyStaged}
        onError={onError}
      />,
    );
    expect(screen.getByText(/Ready to update Archidekt/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Copy full deck import/i }));
    await waitFor(() => expect(onApplyStaged).toHaveBeenCalledWith('Copied to clipboard.'));
    fireEvent.click(screen.getByRole('button', { name: /Apply via bridge/i }));
    expect(onError).toHaveBeenCalledWith('staged fail');

    vi.spyOn(archidektBridge, 'stageDeckApply').mockReturnValue({ deckId: 1, url: 'https://archidekt.com' });
    const openSpy = vi.fn();
    vi.stubGlobal('open', openSpy);
    fireEvent.click(screen.getByRole('button', { name: /Apply via bridge/i }));
    expect(openSpy).toHaveBeenCalled();
    expect(onApplyStaged).toHaveBeenCalledWith(expect.stringMatching(/Staged/));
    vi.unstubAllGlobals();
  });

  it('update pane gates on missing snapshot and incomplete review', () => {
    sessionStorage.setItem('dr-status-expanded', '1');
    const { rerender } = render(
      <DeckReviewStatusCard
        deck={deck({ deck_snapshot: undefined })}
        progress={emptyProgress}
        deckPrefs={{}}
        statusCardTab="update"
        transferSource="upload"
        onTabChange={vi.fn()}
        onRefreshDeck={vi.fn()}
        onApplyStaged={vi.fn()}
        onError={vi.fn()}
      />,
    );
    expect(screen.getByText(/Refresh or enrich deck snapshot/i)).toBeInTheDocument();

    rerender(
      <DeckReviewStatusCard
        deck={deck({
          deck_snapshot: { fetched_at: '2026-06-22', cards: [{ name: 'Sol Ring' }] },
        })}
        progress={emptyProgress}
        deckPrefs={{}}
        statusCardTab="update"
        transferSource="upload"
        onTabChange={vi.fn()}
        onRefreshDeck={vi.fn()}
        onApplyStaged={vi.fn()}
        onError={vi.fn()}
      />,
    );
    expect(screen.getByText(/Review all suggestions first/i)).toBeInTheDocument();
  });

  it('collapses from the summary and opens the queue from the collapsed bar', () => {
    sessionStorage.setItem('dr-status-expanded', '1');
    const onTabChange = vi.fn();
    render(
      <DeckReviewStatusCard
        deck={deck()}
        progress={emptyProgress}
        deckPrefs={{}}
        statusCardTab="decisions"
        transferSource="upload"
        onTabChange={onTabChange}
        onRefreshDeck={vi.fn()}
        onApplyStaged={vi.fn()}
        onError={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Collapse/i }));
    expect(screen.getByRole('button', { name: /Open status/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Open queue/i }));
    expect(onTabChange).toHaveBeenCalledWith('queue');
  });

  it('update pane reports nothing to export when import text is blank', () => {
    sessionStorage.setItem('dr-status-expanded', '1');
    vi.spyOn(ArchidektExport, 'deckReviewComplete').mockReturnValue({
      complete: true,
      reviewed: 1,
      total: 1,
    } as never);
    vi.spyOn(ArchidektExport, 'buildFullDeckImport').mockReturnValue('   ');
    render(
      <DeckReviewStatusCard
        deck={deck({
          deck_snapshot: { fetched_at: '2026-06-22', cards: [{ name: 'Sol Ring' }] },
        })}
        progress={{
          decisions: { s1: { status: 'accepted' } },
          currentDeckId: null,
          currentSuggestionIndex: {},
        }}
        deckPrefs={{}}
        statusCardTab="update"
        transferSource="upload"
        onTabChange={vi.fn()}
        onRefreshDeck={vi.fn()}
        onApplyStaged={vi.fn()}
        onError={vi.fn()}
      />,
    );
    expect(screen.getByText(/Nothing to export for this deck/i)).toBeInTheDocument();
  });
});

