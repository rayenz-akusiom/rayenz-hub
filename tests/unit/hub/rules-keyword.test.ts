import { describe, expect, it } from 'vitest';
import { runKeywordSynergy } from '../../../packages/shared/src/suggest/rules-keyword.ts';
import type { DeckRecord, SetScope } from '../../../packages/shared/src/suggest/types.ts';

describe('runKeywordSynergy', () => {
  it('ignores evergreen keyword interests like haste', () => {
    const deck: DeckRecord = {
      deck_id: 'd1',
      deck_snapshot: {
        cards: [{ name: 'Mountain', color_identity: ['R'], cmc: 0 }],
      },
    };
    const scope: SetScope = {
      codes: ['UPGRADE'],
      cards: [
        {
          name: 'Goblin Guide',
          set_code: 'ZEN',
          collector_number: '1',
          type_line: 'Creature',
          oracle_text: 'Haste',
          keywords: ['Haste'],
          color_identity: ['R'],
          cmc: 1,
        },
      ],
    };
    const added = runKeywordSynergy(
      deck,
      scope,
      { keyword_interests: ['haste', 'flashback'] },
      [],
      { focusTags: [], coverage: { cardsResolved: 0, cardsWithTags: 0, percent: 0 } },
    );
    expect(added.some((s) => s.card.name === 'Goblin Guide')).toBe(false);
  });
});
