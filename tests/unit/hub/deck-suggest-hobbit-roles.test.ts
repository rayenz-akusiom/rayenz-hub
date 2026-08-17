import { describe, expect, it } from 'vitest';
import { RoleRules, Tagger, runRulesForDeck } from '../../../packages/shared/src/suggest/index.ts';
import { stripReminderText, textMatchesNeedle } from '../../../packages/shared/src/suggest/signals.ts';

const GRIXIS_PROFILE = {
  format: 'commander' as const,
  roles: [
    { id: 'counterspell', priority: 'high', tags: ['counter', 'instant', 'stack-interaction'] },
    { id: 'finisher', priority: 'high', tags: ['planeswalker', 'X-spell', 'dragon', 'bolas'] },
    { id: 'draw', priority: 'medium', tags: ['card-advantage', 'planeswalker-draw'] },
    { id: 'removal', priority: 'medium', tags: ['destroy', 'exile'] },
  ],
};

const HOBBIT_FALSE_POSITIVES = [
  {
    name: "Azog, Moria's Ruin",
    set_code: 'HOB',
    collector_number: '61',
    type_line: 'Legendary Creature — Goblin Soldier',
    oracle_text:
      "When Azog enters, destroy up to one other target creature. Its controller amasses Goblins X, where X is that creature's power. If you controlled that creature, draw a card. (To amass Goblins X, that player puts X +1/+1 counters on an Army they control. It's also a Goblin. If they don't control an Army, they create a 0/0 black Goblin Army creature token first.)",
    keywords: ['Amass'],
    cmc: 3,
    color_identity: ['B'],
  },
  {
    name: "Bilbo's Deadly Slice",
    set_code: 'HOB',
    collector_number: '62',
    type_line: 'Instant',
    oracle_text: 'Destroy target creature.',
    keywords: [],
    cmc: 3,
    color_identity: ['B'],
  },
  {
    name: 'Bilbo, Thief in the Night',
    set_code: 'HOB',
    collector_number: '33',
    type_line: 'Legendary Creature — Halfling Rogue',
    oracle_text:
      'Spells you cast from anywhere other than your hand cost {1} less to cast.\nWhenever Bilbo attacks, you may cast an artifact, instant, or sorcery spell from your graveyard. If an instant or sorcery spell cast this way would be put into your graveyard, exile it instead.',
    keywords: [],
    cmc: 2,
    color_identity: ['U'],
  },
  {
    name: 'Bolg of the North',
    set_code: 'HOB',
    collector_number: '148',
    type_line: 'Legendary Creature — Goblin Soldier',
    oracle_text:
      "When Bolg enters, you may sacrifice another creature. When you do, Bolg deals damage equal to that creature's power to another target creature. If excess damage was dealt this way, amass Goblins X, where X is that excess damage. (Put X +1/+1 counters on an Army you control. It's also a Goblin. If you don't control an Army, create a 0/0 black Goblin Army creature token first.)",
    keywords: ['Amass'],
    cmc: 5,
    color_identity: ['B', 'R'],
  },
  {
    name: 'Bothersome Noisemaker',
    set_code: 'HOB',
    collector_number: '89',
    type_line: 'Creature — Goblin Bard',
    oracle_text:
      "Whenever you cast a noncreature spell, amass Goblins 1. (Put a +1/+1 counter on an Army you control. It's also a Goblin. If you don't control an Army, create a 0/0 black Goblin Army creature token first.)",
    keywords: ['Amass'],
    cmc: 2,
    color_identity: ['R'],
  },
];

const GOLLUM = {
  name: 'Gollum, Riddle Master',
  set_code: 'HOB',
  collector_number: '70',
  type_line: 'Legendary Creature — Halfling Horror',
  oracle_text:
    "As Gollum enters, choose odd or even. (Zero is even.)\nWhenever an opponent casts a spell with mana value of the chosen quality, choose one that hasn't been chosen —\n• Put a +1/+1 counter on Gollum.\n• Each opponent loses 2 life and you gain 2 life.\n• Draw a card.",
  keywords: [],
  cmc: 2,
  color_identity: ['B'],
};

const COUNTERS_PROFILE = {
  format: 'commander' as const,
  roles: [{ id: 'counters', priority: 'high', tags: ['counters', '+1/+1-counters'] }],
};

function grixisDeck() {
  return {
    deck_id: 'dragon-gods-machinations',
    deck_name: "Dragon-God's Machinations",
    format: 'commander',
    profile: GRIXIS_PROFILE,
    deck_snapshot: {
      cards: [
        {
          name: 'Nicol Bolas, the Ravager',
          primary_category: 'Commander',
          type_line: 'Legendary Creature — Elder Dragon',
          color_identity: ['U', 'B', 'R'],
        },
      ],
    },
  };
}

describe('untagged Hobbit role false positives', () => {
  it('uses spell-counter phrases for needle counter, not +1/+1 counters', () => {
    expect(textMatchesNeedle('counter target spell', 'counter')).toBe(true);
    expect(textMatchesNeedle('counter target spell', 'counterspell')).toBe(true);
    expect(textMatchesNeedle('counter target spell', 'counters')).toBe(false);
    expect(textMatchesNeedle('put a +1/+1 counter on', 'counter')).toBe(false);
    expect(textMatchesNeedle('put a +1/+1 counter on', 'counters')).toBe(true);
    expect(textMatchesNeedle('put a +1/+1 counter on', '+1/+1-counters')).toBe(true);
    const stripped = stripReminderText(HOBBIT_FALSE_POSITIVES[0].oracle_text);
    expect(textMatchesNeedle(stripped.toLowerCase(), 'counter')).toBe(false);
  });

  it('does not score the five Hobbit cards as medium counterspell', () => {
    for (const card of HOBBIT_FALSE_POSITIVES) {
      const match = RoleRules.matchSetCardToRoles(card, GRIXIS_PROFILE);
      if (match?.roleId === 'counterspell') {
        expect(match.score, card.name).toBeLessThan(13);
      }
    }
  });

  it('drops those cards from runRulesForDeck output', () => {
    const { suggestions } = runRulesForDeck(grixisDeck(), {
      primaryCode: 'HOB',
      codes: ['HOB'],
      cards: HOBBIT_FALSE_POSITIVES,
    });
    const names = suggestions.map((s) => s.card.name);
    for (const card of HOBBIT_FALSE_POSITIVES) {
      expect(names).not.toContain(card.name);
    }
  });

  it('does not match a tagged card from counter/instant in rules text', () => {
    const tagged = {
      name: 'Tagged Trap',
      set_code: 'HOB',
      collector_number: '99',
      type_line: 'Instant',
      oracle_text: 'Counter target spell.',
      oracle_tags: ['lifegain'],
      cmc: 2,
      color_identity: ['U'],
    };
    expect(Tagger.hasScryfallOracleTags(tagged)).toBe(true);
    expect(RoleRules.matchSetCardToRoles(tagged, GRIXIS_PROFILE)).toBe(null);
    expect(Tagger.countTagOverlap(tagged, ['counter', 'instant'], null)).toBe(0);
  });

  it('does not score Gollum as a counterspell; does match counters-matter tags', () => {
    const spellMatch = RoleRules.matchSetCardToRoles(GOLLUM, GRIXIS_PROFILE);
    expect(spellMatch?.roleId).not.toBe('counterspell');
    const countersMatch = RoleRules.matchSetCardToRoles(GOLLUM, COUNTERS_PROFILE);
    expect(countersMatch?.roleId).toBe('counters');
    expect(countersMatch!.score).toBeGreaterThanOrEqual(13);
    const { suggestions } = runRulesForDeck(grixisDeck(), {
      primaryCode: 'HOB',
      codes: ['HOB'],
      cards: [GOLLUM],
    });
    expect(suggestions.map((s) => s.card.name)).not.toContain(GOLLUM.name);
  });
});
