import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DeckSuggestApp } from '../../packages/web/src/deck-suggest/DeckSuggestApp';
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

vi.mock('../../packages/web/src/mtg/profile-sync', () => ({
  ProfileSync: {
    isConnected: vi.fn(() => Promise.resolve(false)),
    connectProfilesDir: vi.fn(() => Promise.resolve()),
    readProfileYaml: vi.fn(() => Promise.resolve(null)),
    canWriteProfiles: vi.fn(() => false),
    canWriteProfilesViaDirectory: vi.fn(() => false),
  },
}));

vi.mock('../../packages/web/src/deck-suggest/data', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../packages/web/src/deck-suggest/data')>();
  return {
    ...actual,
    loadHubLibraryDecks: vi.fn(() => Promise.resolve([])),
    readProfileForDeck: vi.fn(() => Promise.resolve(null)),
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

vi.mock('../../packages/web/src/deck-suggest/accept', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../packages/web/src/deck-suggest/accept')>();
  return {
    ...actual,
    persistAcceptedSuggestion: vi.fn(async () => ({ deckId: 'baird' })),
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
            {
              name: 'Baird, Steward of Argive',
              primary_category: 'Commander',
              categories: ['Commander'],
              set_code: 'DOM',
              collector_number: '4',
            },
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
  it('shows empty guidance and setup actions', () => {
    render(<DeckSuggestApp />);

    expect(screen.getByRole('heading', { name: 'Deck Suggest' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Generate' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upload JSON' })).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Deck navigation' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Deck' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Profile' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Connect profiles folder/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Download JSON' })).not.toBeInTheDocument();
  });
});

describe('DeckSuggestApp upload and sidebar', () => {
  it('loads uploaded suggestions JSON', async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: false,
      status: 404,
      json: () => Promise.resolve({}),
    }));
    global.fetch = fetchSpy;

    await loadSuggestionsViaUpload(handoffPayload());

    expect(screen.getByRole('heading', { name: "Caretaker's Talent" })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Baird/i })).toBeInTheDocument();
  });

  it('shows chrome back control and sidebar deck list after upload', async () => {
    await loadSuggestionsViaUpload(handoffPayload());
    expect(screen.getByRole('button', { name: 'Back to setup' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back to setup' })).toHaveClass('dr-chrome-back');
    expect(screen.queryByRole('button', { name: 'Download JSON' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Upload JSON' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Baird/i })).toBeInTheDocument();
    expect(screen.queryByText('Hub library')).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Deck' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Profile' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Card size' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Deck leaders' })).toBeInTheDocument();
    expect(screen.getByLabelText('Baird, Steward of Argive')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Lieutenants' })).not.toBeInTheDocument();
    expect(document.querySelector('.ds-deck-leaders')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Open status/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/No cut suggested/i)).not.toBeInTheDocument();
  });

  it('flips the sidebar between Deck and Profile tabs', async () => {
    const user = await loadSuggestionsViaUpload(handoffPayload());
    expect(screen.getByRole('heading', { name: 'Decks' })).toBeVisible();
    await user.click(screen.getByRole('tab', { name: 'Profile' }));
    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'Deck profile' })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('tab', { name: 'Deck' }));
    expect(screen.getByRole('heading', { name: 'Decks' })).toBeVisible();
  });

  it('returns to setup for a new upload via Back to setup', async () => {
    const user = await loadSuggestionsViaUpload(handoffPayload());
    expect(screen.queryByRole('button', { name: 'Upload JSON' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back to setup' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Upload JSON' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Generate' })).toBeInTheDocument();
    });
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
  it('renders suggestion cards and toolbar tally for active deck', async () => {
    await loadSuggestionsViaUpload(handoffPayload());

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Show all' })).toBeInTheDocument();
    });
    expect(screen.getByRole('heading', { name: "Caretaker's Talent" })).toBeInTheDocument();
  });

  it('places the pending filmstrip inside the lieutenants column', async () => {
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

    await loadSuggestionsViaUpload(data);

    const leaders = await waitFor(() => screen.getByRole('region', { name: 'Deck leaders' }));
    expect(within(leaders).getByLabelText('Pending suggestions')).toBeInTheDocument();
    expect(leaders.querySelector('.ds-lieutenants-col .dr-filmstrip')).toBeTruthy();
    expect(document.querySelector('#dr-suggestion-panel .dr-filmstrip')).toBeNull();
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
    expect(document.querySelector('.ds-lieutenants-col .dr-filmstrip')).toBeNull();

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
