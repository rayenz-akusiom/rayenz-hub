import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DeckSuggestResults } from '../../packages/web/src/deck-suggest/DeckSuggestResults';
import type { GenerationRun, SetScope } from '../../packages/web/src/deck-suggest/types';

vi.mock('../../packages/web/src/deck-suggest/debug', () => ({
  explainCard: vi.fn(() => [{ outcome: 'pass', reason: 'Matched profile tag' }]),
  formatReason: (line: { reason?: string }) => line.reason || 'reason',
}));

vi.mock('../../packages/web/src/deck-suggest/export', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../packages/web/src/deck-suggest/export')>();
  return {
    ...actual,
    collectDebugEntries: vi.fn(() => [
      { deckName: 'Test Deck', entry: { outcome: 'pass', reason: 'trace row' } },
    ]),
  };
});

afterEach(() => {
  cleanup();
});

function sampleRun(): GenerationRun {
  return {
    runId: 'run-1',
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
          {
            suggestion_id: 's2',
            priority_tier: 'normal',
            card: { name: 'Sol Ring', set_code: 'CMM', collector_number: '1' },
            replaces: [],
            rationale: 'Ramp',
          },
        ],
        audit: [],
        analysis: null,
        debug: [{ outcome: 'pass', reason: 'ok' }],
      },
      {
        deck: { deck_id: 'd2', deck_name: 'Skipped Deck' },
        skipped: true,
        skip_reason: 'not_commander',
        message: 'Not a Commander deck',
        suggestions: [],
        audit: [],
        analysis: null,
      },
      {
        deck: { deck_id: 'd3', deck_name: 'Error Deck' },
        skipped: false,
        error: 'Profile missing',
        suggestions: [],
        audit: [],
        analysis: null,
      },
      {
        deck: { deck_id: 'd4', deck_name: 'Empty Deck' },
        skipped: false,
        suggestions: [],
        audit: [],
        analysis: null,
      },
    ],
  };
}

const summary = {
  totalSuggestions: 2,
  totalSwap: 1,
  totalNormal: 1,
  setCodes: ['MSH'],
  poolSize: 4,
  skippedQueueSlots: 2,
};

const setScope = {
  complete: true,
  codes: ['MSH'],
  codesKey: 'MSH',
  cards: [],
  source: 'scryfall',
  primaryCode: 'MSH',
} as SetScope;

describe('DeckSuggestResults', () => {
  it('renders summary, suggestions, and no-suggestion groups', async () => {
    const user = userEvent.setup();
    render(
      <DeckSuggestResults
        generationRun={sampleRun()}
        setScope={setScope}
        summary={summary}
        rulesDebug={false}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Results' })).toBeInTheDocument();
    expect(document.querySelector('.ds-summary-total')?.textContent).toMatch(/2\s*suggestions/i);
    expect(screen.getByText(/Queue slots skipped/i)).toBeInTheDocument();
    expect(screen.getByText('Take Up the Shield')).toBeInTheDocument();
    expect(screen.getByText(/cut Plains/i)).toBeInTheDocument();

    await user.click(screen.getByText(/No suggestions \(3\)/i));
    expect(screen.getByText('Not a Commander deck')).toBeInTheDocument();
    expect(screen.getByText('Profile missing')).toBeInTheDocument();
    expect(screen.getByText(/No suggestions matched deck profile/i)).toBeInTheDocument();
  });

  it('renders debug panel and explain flow', async () => {
    const user = userEvent.setup();
    render(
      <DeckSuggestResults
        generationRun={sampleRun()}
        setScope={setScope}
        summary={summary}
        rulesDebug
      />,
    );

    await user.click(screen.getByText(/Debug trace/i));
    expect(screen.getByText(/trace row/i)).toBeInTheDocument();

    fireEvent.change(document.getElementById('ds-debug-explain-card')!, {
      target: { value: 'Take Up the Shield' },
    });
    await user.click(screen.getByRole('button', { name: 'Explain' }));
    expect(screen.getByText(/Matched profile tag/i)).toBeInTheDocument();
  });
});
