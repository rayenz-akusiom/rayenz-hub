import { describe, expect, it, vi } from 'vitest';
import { acceptAllPendingAsSeeking } from '../../../packages/web/src/deck-review/bulk-seeking.ts';

describe('acceptAllPendingAsSeeking', () => {
  it('persists each pending suggestion as Seeking and reports successes', async () => {
    const deck = { deck_id: 'd1', archidekt_url: 'https://archidekt.com/decks/1/x', deck_name: 'Test' };
    const pending = [
      {
        suggestion_id: 's1',
        action: 'add',
        card: { name: 'Sol Ring', set_code: 'C21', collector_number: '1', scryfall_id: 'sf-1' },
        replaces: [],
      },
      {
        suggestion_id: 's2',
        action: 'add',
        card: { name: 'Arcane Signet', set_code: 'C21', collector_number: '2', scryfall_id: 'sf-2' },
        replaces: [],
      },
    ];
    const persist = vi.fn(async () => ({ deckId: 'd1' }));
    const onAccepted = vi.fn();

    const result = await acceptAllPendingAsSeeking(deck as never, pending as never, {
      persist: persist as never,
      onAccepted,
    });

    expect(result.accepted).toBe(2);
    expect(result.failed).toEqual([]);
    expect(persist).toHaveBeenCalledTimes(2);
    expect(onAccepted).toHaveBeenCalledTimes(2);
    expect(persist.mock.calls[0]![1].accept_kind).toBe('seeking');
    expect(persist.mock.calls[0]![1].card_out).toBeNull();
    expect(onAccepted.mock.calls[0]![0]).toBe('s1');
  });

  it('continues after a persist failure and records the error', async () => {
    const deck = { deck_id: 'd1', archidekt_url: 'https://archidekt.com/decks/1/x' };
    const pending = [
      {
        suggestion_id: 's1',
        action: 'add',
        card: { name: 'A', scryfall_id: 'sf-1' },
        replaces: [],
      },
      {
        suggestion_id: 's2',
        action: 'add',
        card: { name: 'B', scryfall_id: 'sf-2' },
        replaces: [],
      },
    ];
    const persist = vi
      .fn()
      .mockRejectedValueOnce(new Error('Hub offline'))
      .mockResolvedValueOnce({ deckId: 'd1' });

    const result = await acceptAllPendingAsSeeking(deck as never, pending as never, {
      persist: persist as never,
    });

    expect(result.accepted).toBe(1);
    expect(result.failed).toEqual([{ suggestionId: 's1', error: 'Hub offline' }]);
  });
});
