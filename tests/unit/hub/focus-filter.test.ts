import { describe, expect, it } from 'vitest';
import {
  cardMatchesFocus,
  filterSuggestionsByFocus,
  focusKeySuffix,
  normalizeFocusTags,
} from '../../../packages/shared/src/suggest/focus-filter.ts';
import type { SetPoolCard, Suggestion } from '../../../packages/shared/src/suggest/types.ts';

describe('focus-filter', () => {
  const card: SetPoolCard = {
    name: 'Sol Ring',
    set_code: 'CMR',
    collector_number: '1',
    oracle_tags: ['artifact', 'mana-production'],
  };

  it('normalizes and caps focus tags', () => {
    expect(normalizeFocusTags([' Mana-Production ', 'artifact', 'mana-production'])).toEqual([
      'mana-production',
      'artifact',
    ]);
    expect(normalizeFocusTags(['a', 'b', 'c', 'd', 'e', 'f'])).toHaveLength(5);
  });

  it('matches cards by oracle tags', () => {
    expect(cardMatchesFocus(card, ['mana-production'])).toBe(true);
    expect(cardMatchesFocus(card, ['sacrifice'])).toBe(false);
  });

  it('builds stable focus key suffix', () => {
    expect(focusKeySuffix(['mana-production', 'artifact'])).toBe(':focus-artifact+mana-production');
  });

  it('keeps swap-tier suggestions when filtering', () => {
    const normal: Suggestion = {
      suggestion_id: '1',
      action: 'add',
      card: { name: 'Other', oracle_tags: ['creature'] } as SetPoolCard,
      quantity: 1,
      roles_matched: [],
      confidence: 'low',
      rationale: '',
      tags: [],
      replaces: [],
      priority_tier: 'normal',
    };
    const swap: Suggestion = {
      ...normal,
      suggestion_id: '2',
      priority_tier: 'swap',
      card: { name: 'Swap', oracle_tags: [] } as SetPoolCard,
    };
    const filtered = filterSuggestionsByFocus([normal, swap], ['mana-production']);
    expect(filtered.map((s) => s.suggestion_id)).toEqual(['2']);
  });
});
