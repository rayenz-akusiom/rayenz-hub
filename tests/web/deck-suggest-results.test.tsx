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
    taggerCoverage: { cardsResolved: 10, cardsWithTags: 4, percent: 40 },
    deckResults: [
      {
        deck: {
          deck_id: 'd1',
          deck_name: 'Test Deck',
          deck_snapshot: {
            cards: [
              { name: 'Atraxa', primary_category: 'Commander' },
              { name: 'Sol Ring', primary_category: 'Seeking' },
            ],
          },
        },
        skipped: false,
        suggestions: [
          {
            suggestion_id: 's1',
            priority_tier: 'swap',
            confidence: 'high',
            tags: ['rule:queue_in_pair'],
            signals: { types: ['Human'] },
            card: {
              name: 'Take Up the Shield',
              set_code: 'MSH',
              collector_number: '39',
              scryfall_id: 'abcdef12-3456-7890-abcd-ef1234567890',
            },
            replaces: [{ name: 'Plains' }],
            rationale: 'Better protection',
          },
          {
            suggestion_id: 's2',
            priority_tier: 'normal',
            confidence: 'medium',
            tags: ['rule:typal_synergy'],
            signals: { types: ['Elf'] },
            card: {
              name: 'Sol Ring',
              set_code: 'CMM',
              collector_number: '1',
              scryfall_id: 'fedcba98-7654-3210-fedc-ba9876543210',
            },
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
    expect(document.querySelector('.ds-suggestion-grid')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Test Deck — Atraxa' })).toBeInTheDocument();
    expect(screen.getByAltText('Take Up the Shield')).toBeInTheDocument();
    expect(screen.getByText(/Cut Plains/i)).toBeInTheDocument();
    expect(screen.getByText('Seeking')).toBeInTheDocument();

    await user.click(screen.getByText(/No suggestions \(3\)/i));
    expect(screen.getByText('Not a Commander deck')).toBeInTheDocument();
    expect(screen.getByText('Profile missing')).toBeInTheDocument();
    expect(screen.getByText(/No suggestions for this deck/i)).toBeInTheDocument();
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

  it('shows swap tier, confidence and rule lozenges, and name as alt text', () => {
    render(
      <DeckSuggestResults
        generationRun={sampleRun()}
        setScope={setScope}
        summary={summary}
        rulesDebug={false}
      />,
    );
    expect(screen.getByText('swap')).toBeInTheDocument();
    expect(screen.queryByText('normal')).not.toBeInTheDocument();
    expect(document.querySelector('.ds-lozenge-high')?.textContent).toBe('high');
    expect(document.querySelector('.ds-lozenge-medium')?.textContent).toBe('medium');
    expect(screen.getByText('queue_in_pair')).toBeInTheDocument();
    expect(screen.getByText('typal_synergy')).toBeInTheDocument();
    expect(screen.getByAltText('Take Up the Shield')).toBeInTheDocument();
    expect(screen.getByAltText('Sol Ring')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Take Up the Shield' })).not.toBeInTheDocument();
    expect(screen.getByText(/Better protection/i)).toBeInTheDocument();
    expect(screen.queryByText(/Tag coverage/i)).not.toBeInTheDocument();
  });

  it('offers wishlist export or empty state and next page', async () => {
    const user = userEvent.setup();
    const onNextPage = vi.fn();
    const { rerender } = render(
      <DeckSuggestResults
        generationRun={sampleRun()}
        setScope={setScope}
        summary={summary}
        rulesDebug={false}
        wishlistEmpty
        remainingCount={3}
        onNextPage={onNextPage}
      />,
    );
    expect(screen.getByText(/Wishlist export is empty/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Next page \(3 remaining\)/i }));
    expect(onNextPage).toHaveBeenCalledTimes(1);

    rerender(
      <DeckSuggestResults
        generationRun={sampleRun()}
        setScope={setScope}
        summary={summary}
        rulesDebug={false}
        wishlistEmpty={false}
        wishlistText={'1 Sol Ring'}
      />,
    );
    expect(screen.getByLabelText(/Wishlist export/i)).toHaveValue('1 Sol Ring');
  });

  it('dismisses a suggestion without requiring accept', async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(
      <DeckSuggestResults
        generationRun={sampleRun()}
        setScope={setScope}
        summary={summary}
        rulesDebug={false}
        onDismiss={onDismiss}
        onAccept={() => {}}
      />,
    );
    const dismissButtons = screen.getAllByRole('button', { name: 'Dismiss' });
    await user.click(dismissButtons[0]);
    expect(onDismiss).toHaveBeenCalledWith('s1');
  });
});
