import { describe, expect, it } from 'vitest';
import {
  aggregateProfileLozenges,
  buildMissingCardSuggestion,
  lozengeKey,
  lozengesByGroup,
  missingPoolCards,
  plusLozengesToProfileUpdates,
  toggleProfileLozenge,
  typeLineSubtypes,
} from '../../../packages/shared/src/suggest/index.ts';
import { appendToYamlLists, quoteYamlListValue } from '../../../packages/shared/src/suggest/yaml-lists.ts';
import {
  indexArtTags,
  indexOracleTags,
  isAcceptedTagWeight,
  tagsForIllustrationId,
  tagsForOracleId,
} from '../../../packages/shared/src/scryfall/oracle-tags.ts';
import {
  appendDeckSuggestions,
  createInitialReviewState,
} from '../../../packages/web/src/deck-review/review.ts';

describe('typeLineSubtypes', () => {
  it('extracts subtypes after the dash and skips card types', () => {
    expect(typeLineSubtypes('Legendary Creature — Elf Warrior')).toEqual(['Elf', 'Warrior']);
    expect(typeLineSubtypes('Artifact Creature — Golem')).toEqual(['Golem']);
    expect(typeLineSubtypes('Instant')).toEqual([]);
  });
});

describe('aggregateProfileLozenges', () => {
  it('marks existing profile values checked and new card values as minus', () => {
    const lozenges = aggregateProfileLozenges(
      {
        themes: ['tokens'],
        tags: ['ramp'],
        roles: [{ id: 'draw', tags: ['card-draw'] }],
        keyword_interests: ['flying'],
        typal_types: ['Elf'],
        art_tags: ['tree'],
      },
      [
        {
          type_line: 'Creature — Elf Druid',
          keywords: ['Flying', 'Landfall'],
          oracle_tags: ['ramp', 'mana-dork'],
          art_tags: ['tree', 'forest'],
        },
      ],
    );
    expect(lozenges.filter((l) => l.state === 'existing').map((l) => l.value)).toEqual([
      'tokens',
      'ramp',
      'card-draw',
      'flying',
      'Elf',
      'tree',
    ]);
    expect(lozenges.filter((l) => l.state === 'minus').map((l) => `${l.group}:${l.value}`)).toEqual([
      'functional:mana-dork',
      'keywords:Landfall',
      'types:Druid',
      'art:forest',
    ]);
    expect(lozengesByGroup(lozenges).map((g) => g.group)).toEqual([
      'functional',
      'keywords',
      'types',
      'art',
    ]);
  });

  it('does not emit a minus chip when the card value is already on the profile', () => {
    const lozenges = aggregateProfileLozenges(
      { themes: ['ramp'] },
      [{ oracle_tags: ['ramp'] }],
    );
    expect(lozenges.filter((l) => l.group === 'functional')).toEqual([
      { group: 'functional', value: 'ramp', state: 'existing' },
    ]);
  });

  it('toggles minus to plus and only plus values become profile updates', () => {
    const lozenges = aggregateProfileLozenges({ themes: ['tokens'] }, [
      { oracle_tags: ['mana-dork'], keywords: ['Landfall'] },
    ]);
    const key = lozengeKey({ group: 'functional', value: 'mana-dork' });
    const toggled = toggleProfileLozenge(lozenges, key);
    expect(toggled.find((l) => l.value === 'mana-dork')?.state).toBe('plus');
    expect(plusLozengesToProfileUpdates(toggled)).toEqual({
      themes: ['mana-dork'],
      keyword_interests: [],
      typal_types: [],
      art_tags: [],
    });
  });
});

describe('buildMissingCardSuggestion', () => {
  it('builds a consider suggestion with minus lozenges by default', () => {
    const suggestion = buildMissingCardSuggestion(
      {
        name: 'Missing Elf',
        set_code: 'MSH',
        collector_number: '9',
        type_line: 'Creature — Elf',
        oracle_tags: ['mana-dork'],
        color_identity: ['G'],
      },
      { themes: ['tokens'] },
      { deckId: 'deck-1' },
    );
    expect(suggestion.source).toBe('missing_cards');
    expect(suggestion.action).toBe('consider');
    expect(suggestion.priority_tier).toBe('normal');
    expect(suggestion.replaces).toEqual([]);
    expect(suggestion.suggestion_id).toContain('missing:deck-1:');
    expect(suggestion.profile_lozenges?.some((l) => l.state === 'existing' && l.value === 'tokens')).toBe(
      true,
    );
    expect(suggestion.profile_lozenges?.some((l) => l.state === 'minus' && l.value === 'mana-dork')).toBe(
      true,
    );
  });
});

describe('appendDeckSuggestions', () => {
  it('appends and jumps the filmstrip to the new pending suggestion', () => {
    const initial = createInitialReviewState();
    const state = {
      ...initial,
      fileId: 'file-1',
      activeDeckId: 'baird',
      suggestionIndex: 0,
      data: {
        meta: { schema_version: '1.1' },
        decks: [
          {
            deck_id: 'baird',
            deck_name: 'Baird',
            suggestions: [
              {
                suggestion_id: 's1',
                action: 'replace',
                card: { name: 'A' },
                quantity: 1,
                roles_matched: [],
                confidence: 'high',
                rationale: '',
                tags: [],
                replaces: [],
                priority_tier: 'normal',
              },
            ],
          },
        ],
      },
      progress: { decisions: {}, currentDeckId: 'baird', currentSuggestionIndex: { baird: 0 } },
    };
    const missing = buildMissingCardSuggestion(
      { name: 'Missing Elf', set_code: 'MSH', collector_number: '1' },
      null,
      { deckId: 'baird' },
    );
    const next = appendDeckSuggestions(state as never, 'baird', [missing]);
    expect(next.data!.decks[0]!.suggestions).toHaveLength(2);
    expect(next.suggestionIndex).toBe(1);
    expect(next.progress.currentSuggestionIndex.baird).toBe(1);
  });
});

describe('missingPoolCards', () => {
  it('hides names already in the deck or suggestion list', () => {
    const pool = [
      { name: 'In Deck' },
      { name: 'Suggested' },
      { name: 'Available', color_identity: ['G'] },
    ];
    const kept = missingPoolCards(pool, {
      deck_id: 'd1',
      deck_snapshot: {
        cards: [{ name: 'In Deck', primary_category: 'Ramp' }],
      },
      suggestions: [{ card: { name: 'Suggested' } }],
    });
    expect(kept.map((c) => c.name)).toEqual(['Available']);
  });

  it('keeps cards inside commander colour identity and drops the rest', () => {
    const pool = [
      { name: 'Legal', color_identity: ['G'] },
      { name: 'Gold', color_identity: ['G', 'W'] },
      { name: 'Off colour', color_identity: ['R'] },
      { name: 'Colorless', color_identity: [] },
    ];
    const kept = missingPoolCards(pool, {
      deck_id: 'd1',
      deck_snapshot: {
        cards: [
          {
            name: 'Lathril, Blade of the Elves',
            primary_category: 'Commander',
            categories: ['Commander'],
            color_identity: ['G', 'B'],
          },
        ],
      },
    });
    expect(kept.map((c) => c.name)).toEqual(['Legal', 'Colorless']);
  });

  it('unions lieutenant identity the same way Generate does', () => {
    const kept = missingPoolCards([{ name: 'Azorius', color_identity: ['W', 'U'] }], {
      deck_snapshot: {
        cards: [
          { name: 'Partner A', primary_category: 'Commander', color_identity: ['W'] },
          { name: 'Partner B', primary_category: 'Lieutenant', color_identity: ['U'] },
        ],
      },
    });
    expect(kept.map((c) => c.name)).toEqual(['Azorius']);
  });
});

describe('yaml list append', () => {
  it('quotes values that are not simple tokens and batches four lists', () => {
    expect(quoteYamlListValue('ramp')).toBe('ramp');
    expect(quoteYamlListValue('Time Lord')).toBe("'Time Lord'");
    const result = appendToYamlLists('roles:\n  - id: ramp\n', {
      themes: ['tokens', 'tokens'],
      keyword_interests: ['landfall'],
      typal_types: ['Time Lord'],
      art_tags: ['tree'],
    });
    expect(result.changed).toBe(true);
    expect(result.added.themes).toEqual(['tokens']);
    expect(result.text).toContain('themes:');
    expect(result.text).toContain('  - tokens');
    expect(result.text).toContain("  - 'Time Lord'");
    expect(result.text).toContain('art_tags:');
  });
});

describe('scryfall tag indexes', () => {
  const tags = [
    {
      slug: 'ramp',
      taggings: [
        { oracle_id: 'ora-1', weight: 'strong' },
        { oracle_id: 'ora-2', weight: 'weak' },
      ],
    },
    {
      slug: 'squirrel',
      taggings: [{ illustration_id: 'art-1', weight: 'median' }],
    },
  ];

  it('indexes oracle and art taggings by accepted weight', () => {
    expect(isAcceptedTagWeight('weak')).toBe(false);
    expect(tagsForOracleId(indexOracleTags(tags), 'ora-1')).toEqual(['ramp']);
    expect(tagsForOracleId(indexOracleTags(tags), 'ora-2')).toEqual([]);
    expect(tagsForIllustrationId(indexArtTags(tags), 'art-1')).toEqual(['squirrel']);
  });
});
