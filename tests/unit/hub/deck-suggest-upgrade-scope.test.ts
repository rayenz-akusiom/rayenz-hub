import { describe, expect, it } from 'vitest';
import {
  filterSuggestionsByFocus,
  isUpgradePoolScope,
  runRulesForDeck,
} from '../../../packages/shared/src/suggest/index.ts';

describe('isUpgradePoolScope', () => {
  it('detects upgrade pools by poolKind, primaryCode, or synthetic codes key', () => {
    expect(isUpgradePoolScope({ codes: ['MSH'], cards: [], poolKind: 'upgrade' })).toBe(true);
    expect(isUpgradePoolScope({ codes: ['upgrade:d1:25'], cards: [], primaryCode: 'UPGRADE' })).toBe(
      true,
    );
    expect(isUpgradePoolScope({ codes: ['upgrade:d1:25'], cards: [] })).toBe(true);
    expect(isUpgradePoolScope({ codes: ['MSH'], cards: [], primaryCode: 'MSH' })).toBe(false);
  });
});

describe('upgrade pool scope in rules', () => {
  it('emits synergy suggestions when setScope uses synthetic upgrade codes', () => {
    const deck = {
      deck_id: 'dad-energy',
      deck_snapshot: {
        cards: [
          {
            name: 'Sol Ring',
            primary_category: 'Artifact',
            color_identity: ['R', 'G'],
            cmc: 1,
          },
        ],
      },
      profile: {
        roles: [{ id: 'removal', priority: 'high', tags: ['removal'] }],
      },
    };
    const scope = {
      primaryCode: 'UPGRADE',
      codes: ['upgrade:dad-energy:25'],
      poolKind: 'upgrade' as const,
      cards: [
        {
          name: 'Feed the Swarm',
          set_code: 'CMR',
          collector_number: '1',
          type_line: 'Instant',
          oracle_text: 'destroy target creature',
          oracle_tags: ['removal'],
          color_identity: ['B'],
          cmc: 2,
        },
      ],
    };
    const { suggestions } = runRulesForDeck(deck, scope);
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.some((s) => s.card.name === 'Feed the Swarm')).toBe(true);
  });

  it('emits role suggestions with focus tags on upgrade pool scope', () => {
    const deck = {
      deck_id: 'dad-energy',
      deck_snapshot: {
        cards: [
          {
            name: 'Sol Ring',
            primary_category: 'Artifact',
            color_identity: ['R', 'G'],
            cmc: 1,
          },
        ],
      },
      profile: {
        roles: [{ id: 'removal', priority: 'high', tags: ['removal'] }],
      },
    };
    const scope = {
      primaryCode: 'UPGRADE',
      codes: ['upgrade:dad-energy:25'],
      poolKind: 'upgrade' as const,
      cards: [
        {
          name: 'Feed the Swarm',
          set_code: 'CMR',
          collector_number: '1',
          type_line: 'Instant',
          oracle_text: 'destroy target creature',
          oracle_tags: ['removal'],
          color_identity: ['B'],
          cmc: 2,
        },
      ],
    };
    const focusTags = ['removal'];
    const output = runRulesForDeck(deck, scope, { focusTags });
    const suggestions = filterSuggestionsByFocus(output.suggestions, focusTags);
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions.some((s) => s.card.name === 'Feed the Swarm')).toBe(true);
  });

  it('still excludes cards outside release set codes', () => {
    const deck = {
      deck_id: 'd1',
      deck_snapshot: {
        cards: [
          {
            name: 'Cuttable',
            primary_category: 'Ramp',
            cmc: 4,
            type_line: 'Artifact',
            color_identity: ['W'],
          },
        ],
      },
      profile: {
        themes: ['protection'],
      },
    };
    const scope = {
      primaryCode: 'MSH',
      codes: ['MSH'],
      cards: [
        {
          name: 'Wrong Set Protection',
          set_code: 'MH2',
          collector_number: '1',
          type_line: 'Instant',
          oracle_text: 'protection',
          oracle_tags: ['protection'],
          color_identity: ['W'],
        },
      ],
    };
    const { suggestions } = runRulesForDeck(deck, scope);
    expect(suggestions.some((s) => s.card.name === 'Wrong Set Protection')).toBe(false);
  });
});
