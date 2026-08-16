import { describe, expect, it } from 'vitest';
import {
  SUGGEST_PER_DECK_SOFT_CAP,
  SUGGEST_PER_RULE_SOFT_CAP,
  applySoftCap,
  dropLowConfidence,
  rankSuggestionsForCap,
  runRulesForDeck,
  sortSuggestions,
} from '../../../packages/shared/src/suggest/index.ts';
import type { Suggestion } from '../../../packages/shared/src/suggest/types.ts';

function stubSuggestion(
  id: string,
  confidence: string,
  extras: Partial<Suggestion> = {},
): Suggestion {
  return {
    suggestion_id: id,
    action: 'consider',
    card: { name: id, color_identity: ['G'] },
    quantity: 1,
    roles_matched: [],
    confidence,
    rationale: confidence,
    tags: [],
    replaces: [],
    priority_tier: 'normal',
    ...extras,
  };
}

describe('suggest soft caps', () => {
  it('dropLowConfidence removes low only', () => {
    const kept = dropLowConfidence([
      stubSuggestion('a', 'high'),
      stubSuggestion('b', 'medium'),
      stubSuggestion('c', 'low'),
    ]);
    expect(kept.map((s) => s.suggestion_id)).toEqual(['a', 'b']);
  });

  it('applySoftCap keeps all high even above cap, then fills with medium', () => {
    const sixHigh = Array.from({ length: 6 }, (_, i) => stubSuggestion('h' + i, 'high'));
    expect(applySoftCap(sixHigh, 5, rankSuggestionsForCap)).toHaveLength(6);

    const mixed = [
      ...Array.from({ length: 3 }, (_, i) => stubSuggestion('h' + i, 'high')),
      ...Array.from({ length: 8 }, (_, i) => stubSuggestion('m' + i, 'medium')),
      stubSuggestion('l0', 'low'),
    ];
    const capped = applySoftCap(mixed, 5, rankSuggestionsForCap);
    expect(capped.filter((s) => s.confidence === 'high')).toHaveLength(3);
    expect(capped.filter((s) => s.confidence === 'medium')).toHaveLength(2);
    expect(capped.every((s) => s.confidence !== 'low')).toBe(true);
    expect(capped).toHaveLength(5);
  });

  it('soft cap does not prefer early WUBRG over equal-confidence greens', () => {
    const list = [
      ...Array.from({ length: 8 }, (_, i) =>
        stubSuggestion('g' + i, 'medium', {
          card: { name: 'g' + i, color_identity: ['G'] },
        }),
      ),
      ...Array.from({ length: 2 }, (_, i) =>
        stubSuggestion('w' + i, 'medium', {
          card: { name: 'w' + i, color_identity: ['W'] },
        }),
      ),
    ];
    const capped = applySoftCap(list, 5, rankSuggestionsForCap);
    expect(capped).toHaveLength(5);
    expect(capped.every((s) => s.card.color_identity?.[0] === 'G')).toBe(true);
    // Display sort still puts White first when both colours survive.
    const displayBiased = applySoftCap(list, 5, sortSuggestions);
    expect(displayBiased.some((s) => s.card.color_identity?.[0] === 'W')).toBe(true);
  });

  it('colour-sorts after soft-cap merge for display', () => {
    const mixed = [
      stubSuggestion('g1', 'medium', { card: { name: 'Green', color_identity: ['G'] } }),
      stubSuggestion('w1', 'medium', { card: { name: 'White', color_identity: ['W'] } }),
      stubSuggestion('u1', 'medium', { card: { name: 'Blue', color_identity: ['U'] } }),
    ];
    const capped = applySoftCap(mixed, 10, rankSuggestionsForCap);
    expect(capped.map((s) => s.suggestion_id)).toEqual(['g1', 'u1', 'w1']);
    expect(sortSuggestions(capped).map((s) => s.suggestion_id)).toEqual(['w1', 'u1', 'g1']);
  });

  it('runRulesForDeck returns colour-sorted suggestions after merge', () => {
    const deck = {
      deck_id: 'rainbow',
      deck_name: 'Rainbow',
      format: 'commander',
      profile: { format: 'commander', typal_types: ['Elf'] },
      deck_snapshot: {
        cards: [
          {
            name: 'Elf Commander',
            primary_category: 'Commander',
            type_line: 'Legendary Creature — Elf',
            color_identity: ['W', 'U', 'B', 'R', 'G'],
          },
        ],
      },
    };
    const colours = ['G', 'W', 'U', 'B', 'R'] as const;
    const cards = colours.map((ci, i) => ({
      name: 'Elf ' + ci,
      set_code: 'MSH',
      collector_number: String(i + 1),
      type_line: 'Creature — Elf',
      cmc: 2,
      color_identity: [ci] as string[],
    }));
    const { suggestions } = runRulesForDeck(deck, { primaryCode: 'MSH', codes: ['MSH'], cards });
    expect(suggestions.map((s) => s.card.color_identity?.[0])).toEqual(['W', 'U', 'B', 'R', 'G']);
  });

  it('per-rule soft cap keeps at most 5 medium typal hits', () => {
    const deck = {
      deck_id: 'elves',
      deck_name: 'Elves',
      format: 'commander',
      profile: { format: 'commander', typal_types: ['Elf'] },
      deck_snapshot: {
        cards: [
          {
            name: 'Elf Commander',
            primary_category: 'Commander',
            type_line: 'Legendary Creature — Elf',
            color_identity: ['G'],
          },
        ],
      },
    };
    const cards = Array.from({ length: 8 }, (_, i) => ({
      name: 'Elf ' + i,
      set_code: 'MSH',
      collector_number: String(i + 1),
      type_line: 'Creature — Elf',
      cmc: 2,
      color_identity: ['G'] as string[],
    }));
    const { suggestions, audit } = runRulesForDeck(deck, { primaryCode: 'MSH', codes: ['MSH'], cards });
    const typalAudit = audit.find((a) => a.ruleId === 'typal_synergy');
    expect(typalAudit?.suggestionsAdded).toBe(SUGGEST_PER_RULE_SOFT_CAP);
    expect(suggestions).toHaveLength(SUGGEST_PER_RULE_SOFT_CAP);
    expect(suggestions.every((s) => s.confidence === 'medium')).toBe(true);
  });

  it('per-rule soft cap keeps all high queue suggestions above 5', () => {
    const inCards = Array.from({ length: 7 }, (_, i) => ({
      name: 'Queued In ' + i,
      primary_category: 'Queued In' as const,
      set_code: 'MSH',
      collector_number: String(i + 1),
      type_line: 'Creature',
      color_identity: ['G'],
    }));
    const deck = {
      deck_id: 'queue-deck',
      deck_name: 'Queue Deck',
      format: 'commander',
      ownership: 'owned' as const,
      profile: { format: 'commander' },
      deck_snapshot: {
        cards: [
          {
            name: 'Commander',
            primary_category: 'Commander',
            type_line: 'Legendary Creature',
            color_identity: ['G'],
          },
          ...inCards,
        ],
      },
    };
    const cards = inCards.map((c) => ({
      name: c.name,
      set_code: 'MSH',
      collector_number: c.collector_number,
      type_line: 'Creature',
      cmc: 2,
      color_identity: ['G'] as string[],
    }));
    const { suggestions, audit } = runRulesForDeck(deck, { primaryCode: 'MSH', codes: ['MSH'], cards });
    const queueAudit = audit.find((a) => a.ruleId === 'queue_in_pair');
    expect(queueAudit?.suggestionsAdded).toBe(7);
    expect(suggestions.filter((s) => s.confidence === 'high')).toHaveLength(7);
    expect(suggestions.length).toBeGreaterThanOrEqual(7);
  });

  it('per-deck soft cap limits merged medium suggestions to 10', () => {
    const deck = {
      deck_id: 'multi',
      deck_name: 'Multi',
      format: 'commander',
      profile: {
        format: 'commander',
        typal_types: ['Elf'],
        themes: ['tokens'],
        keyword_interests: ['landfall'],
      },
      deck_snapshot: {
        cards: [
          {
            name: 'Commander',
            primary_category: 'Commander',
            type_line: 'Legendary Creature — Elf',
            color_identity: ['G'],
          },
        ],
      },
    };
    const cards = [
      ...Array.from({ length: 5 }, (_, i) => ({
        name: 'Elf ' + i,
        set_code: 'MSH',
        collector_number: 'e' + i,
        type_line: 'Creature — Elf',
        cmc: 2,
        color_identity: ['G'] as string[],
      })),
      ...Array.from({ length: 5 }, (_, i) => ({
        name: 'Token ' + i,
        set_code: 'MSH',
        collector_number: 't' + i,
        type_line: 'Enchantment',
        oracle_tags: ['tokens'],
        cmc: 2,
        color_identity: ['G'] as string[],
      })),
      ...Array.from({ length: 5 }, (_, i) => ({
        name: 'Landfall ' + i,
        set_code: 'MSH',
        collector_number: 'l' + i,
        type_line: 'Creature',
        keywords: ['Landfall'],
        cmc: 2,
        color_identity: ['G'] as string[],
      })),
    ];
    const { suggestions } = runRulesForDeck(deck, { primaryCode: 'MSH', codes: ['MSH'], cards });
    expect(suggestions.length).toBeLessThanOrEqual(SUGGEST_PER_DECK_SOFT_CAP);
    expect(suggestions.every((s) => s.confidence !== 'low')).toBe(true);
  });

  it('drops low-confidence role matches from the final list', () => {
    const deck = {
      deck_id: 'roles',
      deck_name: 'Roles',
      format: 'commander',
      profile: {
        format: 'commander',
        roles: [{ id: 'protection', priority: 'low', tags: ['protection'] }],
      },
      deck_snapshot: {
        cards: [
          {
            name: 'Commander',
            primary_category: 'Commander',
            type_line: 'Legendary Creature',
            color_identity: ['W'],
          },
        ],
      },
    };
    const scope = {
      primaryCode: 'MSH',
      codes: ['MSH'],
      cards: [
        {
          name: 'Weak Protect',
          set_code: 'MSH',
          collector_number: '1',
          type_line: 'Instant',
          oracle_text: 'protection',
          cmc: 1,
          color_identity: ['W'],
        },
      ],
    };
    const { suggestions } = runRulesForDeck(deck, scope);
    expect(suggestions.find((s) => s.card.name === 'Weak Protect')).toBeUndefined();
  });
});
