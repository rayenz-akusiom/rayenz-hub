import { describe, expect, it } from 'vitest';
import { runRulesForDeck } from '../../../packages/shared/src/suggest/index.ts';

function elfDeck() {
  return {
    deck_id: 'elves',
    deck_name: 'Elves',
    format: 'commander',
    profile: {
      format: 'commander',
      typal_types: ['Elf'],
      themes: ['tokens'],
      keyword_interests: ['landfall'],
      blocked_cards: ['Bad Elf'],
      protected_cards: ['Kept Bear'],
      constraints: { max_cmc: 4, avoid_tags: ['mill'] },
    },
    deck_snapshot: {
      cards: [
        { name: 'Elf Commander', primary_category: 'Commander', type_line: 'Legendary Creature — Elf', color_identity: ['G'] },
        { name: 'Kept Bear', primary_category: 'Creature', type_line: 'Creature — Bear', cmc: 2 },
        { name: 'Cut Elf', primary_category: 'Creature', type_line: 'Creature — Elf', cmc: 3 },
      ],
    },
  };
}

function setScope() {
  return {
    primaryCode: 'MSH',
    codes: ['MSH'],
    cards: [
      { name: 'New Elf', set_code: 'MSH', collector_number: '1', type_line: 'Creature — Elf Warrior', cmc: 2, color_identity: ['G'] },
      { name: 'Token Maker', set_code: 'MSH', collector_number: '2', type_line: 'Enchantment', oracle_text: 'Create two tokens.', oracle_tags: ['tokens'], cmc: 3, color_identity: ['G'] },
      { name: 'Tagged Lifegain', set_code: 'MSH', collector_number: '9', type_line: 'Enchantment', oracle_text: 'Create tokens. Landfall — draw a card.', oracle_tags: ['lifegain'], cmc: 2, color_identity: ['G'] },
      { name: 'Landfall Scout', set_code: 'MSH', collector_number: '3', type_line: 'Creature — Scout', keywords: ['Landfall'], oracle_text: 'Landfall — draw a card.', cmc: 2, color_identity: ['G'] },
      { name: 'Text Only Tokens', set_code: 'MSH', collector_number: '8', type_line: 'Sorcery', oracle_text: 'Create tokens.', cmc: 2, color_identity: ['G'] },
      { name: 'Bad Elf', set_code: 'MSH', collector_number: '4', type_line: 'Creature — Elf', cmc: 2, color_identity: ['G'] },
      { name: 'Expensive Elf', set_code: 'MSH', collector_number: '5', type_line: 'Creature — Elf', cmc: 8, color_identity: ['G'] },
      { name: 'Mill Elf', set_code: 'MSH', collector_number: '6', type_line: 'Creature — Elf', oracle_text: 'mill three cards', cmc: 2, color_identity: ['G'] },
      { name: 'Blue Elf', set_code: 'MSH', collector_number: '7', type_line: 'Creature — Elf', cmc: 2, color_identity: ['U'] },
    ],
  };
}

describe('typal/theme/keyword rules', () => {
  it('suggests typal, theme, and keyword hits and skips blocked/constraint/CI/in-deck', () => {
    const { suggestions } = runRulesForDeck(elfDeck(), setScope());
    const names = suggestions.map((s) => s.card.name);
    expect(names).toContain('New Elf');
    expect(names).toContain('Token Maker');
    expect(names).toContain('Landfall Scout');
    expect(names).not.toContain('Text Only Tokens');
    expect(names).not.toContain('Tagged Lifegain');
    expect(names).not.toContain('Bad Elf');
    expect(names).not.toContain('Expensive Elf');
    expect(names).not.toContain('Mill Elf');
    expect(names).not.toContain('Blue Elf');
    expect(suggestions.find((s) => s.card.name === 'New Elf')?.replaces).toEqual([]);
    expect(suggestions.find((s) => s.card.name === 'New Elf')?.action).toBe('consider');
    expect(suggestions.find((s) => s.card.name === 'New Elf')?.confidence).toBeTruthy();
    const elf = suggestions.find((s) => s.card.name === 'New Elf');
    expect(elf?.rationale).toMatch(/Typal match/i);
    expect(elf?.signals?.types).toContain('Elf');
    expect(elf?.tags.some((t) => t === 'rule:typal_synergy')).toBe(true);
    const theme = suggestions.find((s) => s.card.name === 'Token Maker');
    expect(theme?.rationale).toMatch(/Theme match/i);
    expect(theme?.signals?.tags).toContain('tokens');
    expect(theme?.confidence).toBe('medium');
    const keyword = suggestions.find((s) => s.card.name === 'Landfall Scout');
    expect(keyword?.rationale).toMatch(/Keyword/i);
    expect(keyword?.confidence).toBe('medium');
  });

  it('is deterministic', () => {
    const a = runRulesForDeck(elfDeck(), setScope()).suggestions.map((s) => s.suggestion_id);
    const b = runRulesForDeck(elfDeck(), setScope()).suggestions.map((s) => s.suggestion_id);
    expect(a).toEqual(b);
  });

  it('still suggests cards that are Seeking or Queued In', () => {
    const deck = {
      ...elfDeck(),
      deck_snapshot: {
        cards: [
          ...elfDeck().deck_snapshot.cards,
          { name: 'New Elf', primary_category: 'Seeking', type_line: 'Creature — Elf' },
          { name: 'Token Maker', primary_category: 'Queued In', type_line: 'Enchantment' },
        ],
      },
    };
    const { suggestions } = runRulesForDeck(deck, setScope());
    const names = suggestions.map((s) => s.card.name);
    expect(names).toContain('New Elf');
    expect(names).toContain('Token Maker');
  });
});
