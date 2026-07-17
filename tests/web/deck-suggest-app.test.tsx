import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import setMshSlice from '../fixtures/deck-suggest/set-msh-slice.json';
import { DeckSuggestApp } from '../../packages/web/src/deck-suggest/DeckSuggestApp';
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
    loadDeckSuggestSettings: vi.fn(() => ({
      setCodes: 'MSH,MSC,MAR',
      folderUrl: '',
      deckLoadTab: 'paste-import',
    })),
    saveDeckSuggestSettings: vi.fn(),
  };
});

vi.mock('../../packages/web/src/mtg/profile-sync', () => ({
  ProfileSync: { getProfilesDir: vi.fn(() => Promise.resolve(null)) },
}));

const mockGenerateSuggestions = vi.fn();
const mockTransferToDeckReview = vi.fn();
const mockRestoreSetPool = vi.fn(() => null);

vi.mock('../../packages/web/src/deck-suggest/generation', () => ({
  restoreSetPoolFromSettings: (...args: unknown[]) => mockRestoreSetPool(...args),
  generateSuggestions: (...args: unknown[]) => mockGenerateSuggestions(...args),
  transferToDeckReview: (...args: unknown[]) => mockTransferToDeckReview(...args),
}));

const mockFetchSetPool = vi.fn();

vi.mock('../../packages/web/src/deck-suggest/data', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../packages/web/src/deck-suggest/data')>();
  return {
    ...actual,
    fetchSetPool: (...args: unknown[]) => mockFetchSetPool(...args),
  };
});

vi.mock('../../packages/web/src/deck-suggest/readiness', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../packages/web/src/deck-suggest/readiness')>();
  return {
    ...actual,
    getGenerateReadiness: vi.fn((state: Parameters<typeof actual.getGenerateReadiness>[0]) => {
      const selected = (state?.deckSelection?.selectedIds || []).length;
      if (selected > 0 && state?.setScope) {
        return {
          ok: true,
          missing: [],
          items: [
            { id: 'set', ok: true, label: 'Set pool loaded — 4 cards' },
            { id: 'decks', ok: true, label: `${state!.deckSelection!.decks.length} deck(s) available` },
            { id: 'selection', ok: true, label: `${selected} deck(s) selected` },
          ],
          generating: !!state?.generating,
        };
      }
      return actual.getGenerateReadiness(state);
    }),
  };
});

function readySetScope() {
  return {
    complete: true,
    codes: ['MSH', 'MSC', 'MAR'],
    codesKey: 'MAR,MSH,MSC',
    cards: setMshSlice.cards,
    source: 'scryfall' as const,
    primaryCode: 'MSH',
    setName: 'Marvel Super Heroes',
    fetchedAt: '2026-06-30',
  };
}

function sampleGenerationRun() {
  return {
    runId: 'run-test',
    rulesExecuted: [],
    deckResults: [
      {
        deck: { deck_id: 'd1', deck_name: 'Test Deck' },
        skipped: false,
        suggestions: [
          {
            suggestion_id: 's1',
            priority_tier: 'swap',
            card: { name: 'Take Up the Shield', set_code: 'MSH', collector_number: '39' },
            replaces: [{ name: 'Plains' }],
            rationale: 'Better protection',
          },
        ],
        audit: [],
        analysis: null,
      },
      {
        deck: { deck_id: 'd2', deck_name: 'Empty Deck' },
        skipped: true,
        skip_reason: 'not_commander',
        message: 'Not a Commander deck',
        suggestions: [],
        audit: [],
        analysis: null,
      },
    ],
  };
}

beforeEach(() => {
  resetHubModules();
  mockGenerateSuggestions.mockReset();
  mockTransferToDeckReview.mockReset();
  mockRestoreSetPool.mockReset();
  mockFetchSetPool.mockReset();
  progressController.start.mockClear();
  progressController.update.mockClear();
  progressController.finish.mockClear();
  mockRestoreSetPool.mockReturnValue({ ...readySetScope(), fromCache: true });
  mockFetchSetPool.mockResolvedValue(readySetScope());
  mockGenerateSuggestions.mockResolvedValue(sampleGenerationRun());
  mockTransferToDeckReview.mockResolvedValue(undefined);
  delete (window as Window & { RayenzArchidektBridge?: unknown }).RayenzArchidektBridge;
});

afterEach(() => {
  cleanup();
  resetHubModules();
  document.body.innerHTML = '';
});

describe('DeckSuggestApp chrome', () => {
  it('renders header, disabled generate, and results placeholder', () => {
    mockRestoreSetPool.mockReturnValue(null);
    render(<DeckSuggestApp />);

    expect(screen.getByRole('heading', { name: 'Deck Suggest' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Generate suggestions' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Review in Deck Review' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Download JSON' })).toBeDisabled();
    expect(screen.getByText('Run Generate to see suggestions.')).toBeInTheDocument();
  });

  it('mounts hub progress on load', () => {
    render(<DeckSuggestApp />);
    expect(document.getElementById('ds-progress-host')).toBeInTheDocument();
  });
});

describe('DeckSuggestSetup', () => {
  it('shows setup fields and deck load tabs', async () => {
    const user = userEvent.setup();
    render(<DeckSuggestApp />);

    expect(screen.getByRole('heading', { name: 'Setup' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Set codes/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Open Deck Suggest settings/i })).toHaveAttribute(
      'href',
      '#/settings/deck-suggest',
    );

    await user.click(screen.getByRole('button', { name: 'Paste URLs' }));
    expect(document.getElementById('ds-deck-pane-paste-urls')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Upload JSON' }));
    expect(document.getElementById('ds-deck-pane-upload')).toBeInTheDocument();
  });

  it('disables folder tab when Archidekt bridge is unavailable', () => {
    render(<DeckSuggestApp />);
    expect(screen.getByRole('button', { name: 'Folder' })).toBeDisabled();
  });

  it('restores cached set pool on load', async () => {
    render(<DeckSuggestApp />);
    await waitFor(() => {
      expect(screen.getByText(/Set pool: MSH, MSC, MAR/i)).toBeInTheDocument();
    });
  });

  it('shows fetch error when set pool load fails', async () => {
    mockRestoreSetPool.mockReturnValue(null);
    mockFetchSetPool.mockRejectedValueOnce(new Error('Scryfall unavailable'));
    const user = userEvent.setup();
    render(<DeckSuggestApp />);

    fireEvent.change(screen.getByLabelText(/Set codes/i), { target: { value: 'MSH' } });
    await user.click(screen.getByRole('button', { name: 'Load set pool' }));

    await waitFor(() => {
      expect(screen.getByText('Scryfall unavailable')).toBeInTheDocument();
    });
  });

  it('loads a pasted deck import and lists selectable decks', async () => {
    const user = userEvent.setup();
    render(<DeckSuggestApp />);

    await waitFor(() => {
      expect(screen.getByText(/Set pool: MSH, MSC, MAR/i)).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText(/Deck name \(optional\)/i), 'My Commander');
    fireEvent.change(screen.getByLabelText(/Archidekt import text/i), {
      target: { value: '1 Sol Ring (cmm) 1 [Ramp]\n1 Lightning Bolt (mh2) 123 [Removal]' },
    });
    await user.click(screen.getByRole('button', { name: 'Load deck' }));

    await waitFor(() => {
      expect(screen.getByText('Decks (1)')).toBeInTheDocument();
      expect(screen.getByLabelText('My Commander')).toBeInTheDocument();
    });
  });
});

describe('DeckSuggestResults via generate', () => {
  async function prepareReadyState(user: ReturnType<typeof userEvent.setup>) {
    render(<DeckSuggestApp />);
    await waitFor(() => expect(screen.getByText(/Set pool:/i)).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText(/Archidekt import text/i), {
      target: { value: '1 Sol Ring (cmm) 1 [Ramp]' },
    });
    await user.click(screen.getByRole('button', { name: 'Load deck' }));
    await waitFor(() => expect(screen.getByText(/Decks \(1\)/i)).toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Generate suggestions' })).toBeEnabled());
  }

  it('runs generate and renders results summary and suggestions', async () => {
    const user = userEvent.setup();
    await prepareReadyState(user);

    await user.click(screen.getByRole('button', { name: 'Generate suggestions' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Results' })).toBeInTheDocument();
    });
    expect(document.querySelector('.ds-summary-total')?.textContent).toMatch(/1 suggestions/);
    expect(screen.getByText('Test Deck')).toBeInTheDocument();
    expect(screen.getByText('Take Up the Shield')).toBeInTheDocument();
    expect(screen.getByText(/No suggestions \(1\)/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review in Deck Review' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Download JSON' })).toBeEnabled();
  });

  it('shows generation error in the error banner', async () => {
    mockGenerateSuggestions.mockRejectedValueOnce(new Error('Generation failed'));
    const user = userEvent.setup();
    await prepareReadyState(user);

    await user.click(screen.getByRole('button', { name: 'Generate suggestions' }));

    await waitFor(() => {
      expect(screen.getByText('Generation failed')).toBeInTheDocument();
    });
  });
});
