import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { DeckEntry, Suggestion } from '@rayenz-hub/shared';
import { SuggestionCard } from '../../packages/web/src/deck-review/SuggestionCard';
import type { ReviewProgress } from '../../packages/web/src/lib/hub-storage';

const persistAcceptedSuggestion = vi.fn();

vi.mock('../../packages/web/src/deck-suggest/accept', () => ({
  persistAcceptedSuggestion: (...args: unknown[]) => persistAcceptedSuggestion(...args),
}));

vi.mock('../../packages/web/src/deck-review/data', async () => {
  const actual = await vi.importActual<typeof import('../../packages/web/src/deck-review/data')>(
    '../../packages/web/src/deck-review/data',
  );
  return {
    ...actual,
    fetchPrintings: vi.fn(async () => [
      {
        id: 'sr-id',
        name: 'Sol Ring',
        set: 'cmm',
        collector_number: '1',
        finishes: ['nonfoil'],
      },
    ]),
  };
});

vi.mock('../../packages/web/src/deck-review/pickers', async () => {
  const actual = await vi.importActual<typeof import('../../packages/web/src/deck-review/pickers')>(
    '../../packages/web/src/deck-review/pickers',
  );
  return {
    ...actual,
    openPrintPicker: vi.fn(),
    openCutPicker: vi.fn(),
  };
});

const suggestion: Suggestion = {
  suggestion_id: 'deck-1-001',
  action: 'add',
  card: {
    name: 'Sol Ring',
    set_code: 'cmm',
    collector_number: '1',
    scryfall_id: 'sr-id',
  },
  quantity: 1,
  roles_matched: ['ramp'],
  confidence: 'high',
  rationale: 'Underfull deck needs ramp.',
  tags: [],
  replaces: [],
  priority_tier: 'normal',
};

const deck: DeckEntry = {
  deck_id: 'hub-1',
  deck_name: 'Underfull',
  format: 'commander',
  archidekt_url: '',
  suggestions: [suggestion],
  deck_snapshot: {
    cards: [
      {
        name: 'Plains',
        quantity: 1,
        set_code: 'cmm',
        collector_number: '1',
        primary_category: 'Land',
        categories: ['Land'],
      },
    ],
  },
};

const emptyProgress: ReviewProgress = {
  fileId: 'f1',
  decisions: {},
  updatedAt: '2026-01-01T00:00:00.000Z',
};

beforeEach(() => {
  persistAcceptedSuggestion.mockResolvedValue({});
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('SuggestionCard Add mode', () => {
  it('accepts Add to deck without an Out cut', async () => {
    const user = userEvent.setup();
    const onDecision = vi.fn();
    const onProfileUpdate = vi.fn();

    render(
      <SuggestionCard
        deck={deck}
        suggestion={suggestion}
        progress={emptyProgress}
        advanceOnAction={false}
        onDecision={onDecision}
        onProfileUpdate={onProfileUpdate}
        deckPrefs={{}}
      />,
    );

    expect(screen.getByRole('button', { name: 'Add' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Deck' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByRole('button', { name: 'Choose cut' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Accept Add' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Accept Add' }));

    await waitFor(() => {
      expect(persistAcceptedSuggestion).toHaveBeenCalledTimes(1);
    });
    expect(persistAcceptedSuggestion.mock.calls[0][1]).toMatchObject({
      accept_kind: 'add',
      add_destination: 'deck',
      card_out: null,
      card_in: { name: 'Sol Ring' },
    });
    await waitFor(() => {
      expect(onDecision).toHaveBeenCalledWith(
        'deck-1-001',
        expect.objectContaining({
          status: 'accepted',
          accepted: expect.objectContaining({
            accept_kind: 'add',
            add_destination: 'deck',
          }),
        }),
        false,
      );
    });
    expect(onProfileUpdate).toHaveBeenCalledWith({ profileStatus: 'Added to deck.' });
  });

  it('accepts Add to Maybeboard', async () => {
    const user = userEvent.setup();
    const onDecision = vi.fn();
    const onProfileUpdate = vi.fn();

    render(
      <SuggestionCard
        deck={deck}
        suggestion={suggestion}
        progress={emptyProgress}
        advanceOnAction={false}
        onDecision={onDecision}
        onProfileUpdate={onProfileUpdate}
        deckPrefs={{}}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Maybeboard' }));
    expect(screen.getByRole('button', { name: 'Maybeboard' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: 'Accept Add' }));

    await waitFor(() => {
      expect(persistAcceptedSuggestion).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          accept_kind: 'add',
          add_destination: 'maybeboard',
        }),
      );
    });
    expect(onProfileUpdate).toHaveBeenCalledWith({ profileStatus: 'Added to Maybeboard.' });
  });
});
