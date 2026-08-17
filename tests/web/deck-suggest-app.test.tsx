import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DeckDocument } from '@rayenz-hub/shared';
import { DeckSuggestApp } from '../../packages/web/src/deck-suggest/DeckSuggestApp';
import { getGenerateReadiness } from '../../packages/web/src/deck-suggest/readiness';
import { resetHubModules } from '../unit/helpers/hubHarness';
import { progressController } from './helpers/hub-progress-mock';
import commander from '../fixtures/deck-builder/commander-slice.json';

vi.mock('../../packages/web/src/lib/hub-progress', async () => {
  const { hubProgressMockModule } = await import('./helpers/hub-progress-mock');
  return hubProgressMockModule();
});

vi.mock('../../packages/web/src/lib/hub-storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../packages/web/src/lib/hub-storage')>();
  return {
    ...actual,
    loadDeckSuggestSettings: vi.fn(() => ({
      setCodes: 'MSH',
      releaseId: 'group:ltr',
      setInputMode: 'release',
    })),
    saveDeckSuggestSettings: vi.fn(),
  };
});

vi.mock('../../packages/web/src/api/hub-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../packages/web/src/api/hub-api')>();
  return {
    ...actual,
    isApiConfigured: () => true,
  };
});

const mockGenerateSuggestions = vi.fn();
const mockTransferToDeckReview = vi.fn();
const mockLoadHubLibraryDecks = vi.fn();
const mockGetDeck = vi.fn();
const mockApiGetDeck = vi.fn();
const mockPersistSuggestPatch = vi.fn();

vi.mock('../../packages/web/src/deck-suggest/generation', () => ({
  generateSuggestions: (...args: unknown[]) => mockGenerateSuggestions(...args),
  transferToDeckReview: (...args: unknown[]) => mockTransferToDeckReview(...args),
}));

vi.mock('../../packages/web/src/deck-suggest/data', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../packages/web/src/deck-suggest/data')>();
  return {
    ...actual,
    loadHubLibraryDecks: (...args: unknown[]) => mockLoadHubLibraryDecks(...args),
  };
});

vi.mock('../../packages/web/src/deck-builder/store/deck-store', () => ({
  getDeck: (...args: unknown[]) => mockGetDeck(...args),
}));

vi.mock('../../packages/web/src/deck-builder/store/deck-api', () => ({
  apiGetDeck: (...args: unknown[]) => mockApiGetDeck(...args),
}));

vi.mock('../../packages/web/src/deck-suggest/accept', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../packages/web/src/deck-suggest/accept')>();
  return {
    ...actual,
    persistSuggestPatch: (...args: unknown[]) => mockPersistSuggestPatch(...args),
  };
});

vi.mock('../../packages/web/src/deck-suggest/readiness', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../packages/web/src/deck-suggest/readiness')>();
  return {
    ...actual,
    getGenerateReadiness: vi.fn((state: Parameters<typeof actual.getGenerateReadiness>[0]) => {
      const selected = (state?.deckSelection?.selectedIds || []).length;
      if (selected > 20) {
        return actual.getGenerateReadiness(state);
      }
      const mode = state?.ui?.setInputMode || 'release';
      const hasRelease = mode === 'release' && String(state?.ui?.releaseId || '').includes(':');
      const hasCodes =
        mode === 'codes' &&
        String(state?.ui?.setCodesInput || '')
          .split(/[,\s]+/)
          .filter(Boolean).length > 0;
      if (selected > 0 && (hasRelease || hasCodes)) {
        return {
          ok: true,
          missing: [],
          items: [
            { id: 'set', ok: true, label: 'Release selected' },
            { id: 'decks', ok: true, label: `${state!.deckSelection!.decks.length} deck(s) available` },
            { id: 'selection', ok: true, label: `${selected} deck(s) selected` },
            { id: 'api', ok: true, label: 'API configured' },
          ],
          generating: !!state?.generating,
        };
      }
      return actual.getGenerateReadiness(state);
    }),
  };
});

function sampleGenerationRun() {
  return {
    runId: 'run-test',
    rulesExecuted: [],
    setCodes: ['LTR', 'LTC'],
    setCodesKey: 'LTC,LTR',
    deckResults: [
      {
        deck: { deck_id: 'd1', deck_name: 'Test Deck' },
        skipped: false,
        suggestions: [
          {
            suggestion_id: 's1',
            priority_tier: 'swap',
            confidence: 'high',
            tags: ['rule:queue_in_pair'],
            card: {
              name: 'Take Up the Shield',
              set_code: 'LTR',
              collector_number: '39',
              scryfall_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
            },
            replaces: [{ name: 'Plains' }],
            rationale: 'Better protection',
          },
          {
            suggestion_id: 's2',
            priority_tier: 'normal',
            confidence: 'medium',
            tags: ['rule:typal_synergy'],
            card: {
              name: 'Sol Ring',
              set_code: 'LTR',
              collector_number: '1',
              scryfall_id: 'bbbbbbbb-cccc-dddd-eeee-ffffffffffff',
            },
            replaces: [],
            rationale: 'Ramp',
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
  mockLoadHubLibraryDecks.mockReset();
  mockGetDeck.mockReset();
  mockApiGetDeck.mockReset();
  mockPersistSuggestPatch.mockReset();
  progressController.start.mockClear();
  progressController.update.mockClear();
  progressController.finish.mockClear();
  mockLoadHubLibraryDecks.mockResolvedValue([
    { deck_id: 'd1', deck_name: 'Test Deck' },
    { deck_id: 'd2', deck_name: 'Empty Deck' },
  ]);
  mockGenerateSuggestions.mockResolvedValue(sampleGenerationRun());
  mockTransferToDeckReview.mockResolvedValue(undefined);
  mockGetDeck.mockResolvedValue(commander as unknown as DeckDocument);
  mockApiGetDeck.mockResolvedValue(null);
  mockPersistSuggestPatch.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
  resetHubModules();
  document.body.innerHTML = '';
});

describe('DeckSuggestApp chrome', () => {
  it('renders header, generate, card size picker, and results placeholder', async () => {
    mockLoadHubLibraryDecks.mockResolvedValueOnce([]);
    render(<DeckSuggestApp />);

    expect(screen.getByRole('heading', { name: 'Deck Suggest' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Card size' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Generate' })).toBeDisabled();
    expect(screen.getByText('Press Generate to see suggestions.')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/No commander decks found/i)).toBeInTheDocument();
    });
  });

  it('blocks generate when the selected page is over cap', () => {
    const mocked = vi.mocked(getGenerateReadiness);
    const previous = mocked.getMockImplementation();
    mocked.mockImplementation(() => ({
      ok: false,
      missing: ['cap'],
      items: [{ id: 'cap', ok: false, label: 'Select at most 20 decks' }],
      generating: false,
    }));
    try {
      render(<DeckSuggestApp />);
      expect(screen.getByRole('button', { name: 'Generate' })).toBeDisabled();
      expect(screen.getByText(/Select at most 20/i)).toBeInTheDocument();
    } finally {
      if (previous) mocked.mockImplementation(previous);
    }
  });

  it('mounts hub progress on load', () => {
    render(<DeckSuggestApp />);
    expect(document.getElementById('ds-progress-host')).toBeInTheDocument();
  });

  it('scales suggestion grid via shared card size preference', async () => {
    const user = userEvent.setup();
    const { container } = render(<DeckSuggestApp />);
    const app = container.querySelector('.deck-suggest-app') as HTMLElement;
    expect(app.style.getPropertyValue('--db-card-w')).toBe('213px');

    await user.click(screen.getByRole('button', { name: 'Large' }));
    expect(app.style.getPropertyValue('--db-card-w')).toBe('310px');

    await user.click(screen.getByRole('button', { name: 'Small' }));
    expect(app.style.getPropertyValue('--db-card-w')).toBe('150px');
  });
});

describe('DeckSuggestSetup', () => {
  it('shows release dropdown by default and set-codes mode', async () => {
    const user = userEvent.setup();
    render(<DeckSuggestApp />);

    expect(screen.getByRole('heading', { name: 'Setup' })).toBeInTheDocument();
    expect(screen.getByLabelText(/^Set release$/i)).toBeInTheDocument();
    expect(screen.getByDisplayValue(/Lord of the Rings/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Load set pool' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Set codes' }));
    expect(screen.getByLabelText(/Set codes/i)).toBeInTheDocument();
  });

  it('auto-loads hub decks into the checklist', async () => {
    render(<DeckSuggestApp />);
    await waitFor(() => {
      expect(screen.getByLabelText('Test Deck')).toBeInTheDocument();
      expect(screen.getByLabelText('Empty Deck')).toBeInTheDocument();
    });
  });
});

describe('DeckSuggestResults via generate', () => {
  async function prepareReadyState() {
    render(<DeckSuggestApp />);
    await waitFor(() => expect(screen.getByLabelText('Test Deck')).toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Generate' })).toBeEnabled());
  }

  it('runs generate and renders results grid and summary', async () => {
    const user = userEvent.setup();
    await prepareReadyState();

    await user.click(screen.getByRole('button', { name: 'Generate' }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Results' })).toBeInTheDocument();
    });
    expect(document.querySelector('.ds-summary-total')?.textContent).toMatch(/2 suggestions/);
    expect(screen.getByRole('heading', { name: 'Test Deck' })).toBeInTheDocument();
    expect(screen.getByRole('article', { name: 'Take Up the Shield' })).toBeInTheDocument();
    expect(document.querySelector('.ds-suggestion-grid')).toBeInTheDocument();
  });

  it('dismisses a card from the session without a Hub write', async () => {
    const user = userEvent.setup();
    await prepareReadyState();
    await user.click(screen.getByRole('button', { name: 'Generate' }));
    await waitFor(() =>
      expect(screen.getByRole('article', { name: 'Take Up the Shield' })).toBeInTheDocument(),
    );
    await user.click(screen.getAllByRole('button', { name: 'Dismiss' })[0]);
    expect(screen.queryByRole('article', { name: 'Take Up the Shield' })).not.toBeInTheDocument();
  });

  it('keeps accepted cards visible and opens the next Accept dialogue', async () => {
    const user = userEvent.setup();
    await prepareReadyState();
    await user.click(screen.getByRole('button', { name: 'Generate' }));
    await waitFor(() =>
      expect(screen.getByRole('article', { name: 'Take Up the Shield' })).toBeInTheDocument(),
    );

    await user.click(screen.getAllByRole('button', { name: 'Accept' })[0]);
    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /Accept suggestion/i })).toBeInTheDocument();
    });
    expect(screen.getByTestId('swap-queue-edit')).toHaveTextContent('Take Up the Shield');

    await user.click(screen.getByRole('tab', { name: 'Add to Seeking' }));
    await user.click(screen.getByRole('button', { name: 'Add to Seeking' }));

    await waitFor(() => {
      expect(mockPersistSuggestPatch).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(screen.getByText('Accepted')).toBeInTheDocument();
    });
    expect(screen.getByRole('article', { name: 'Take Up the Shield' })).toBeInTheDocument();
    expect(document.querySelector('.ds-suggestion-card-accepted')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByRole('dialog', { name: /Accept suggestion/i })).toBeInTheDocument();
    });
    const dialog = screen.getByRole('dialog', { name: /Accept suggestion/i });
    expect(within(dialog).getByTestId('swap-queue-edit')).toHaveTextContent('Sol Ring');
  });

  it('shows generation error in the error banner', async () => {
    mockGenerateSuggestions.mockRejectedValueOnce(new Error('Generation failed'));
    const user = userEvent.setup();
    await prepareReadyState();

    await user.click(screen.getByRole('button', { name: 'Generate' }));

    await waitFor(() => {
      expect(screen.getByText('Generation failed')).toBeInTheDocument();
    });
  });
});
