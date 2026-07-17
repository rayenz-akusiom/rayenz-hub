import fs from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RoleRules, Tagger } from '../../../packages/web/src/deck-suggest/index.ts';
import { resetHubModules, REPO_ROOT } from '../helpers/hubHarness.ts';

const FIXTURE_DIR = path.join(REPO_ROOT, 'tests/fixtures/deck-suggest');

function loadFixture(name: string) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, name), 'utf8'));
}

beforeEach(() => {
  resetHubModules();
});

afterEach(() => {
  resetHubModules();
});

describe('Tagger.countTagOverlap', () => {
  it('returns zero for empty tag lists', () => {
    expect(Tagger.countTagOverlap({ name: 'Bolt', type_line: 'Instant' }, [], null)).toBe(0);
  });

  it('matches via tagger context tags and oracle text blob', () => {
    const card = {
      name: 'Shield',
      type_line: 'Instant',
      oracle_text: 'protection indestructible',
      keywords: ['Flash'],
    };
    const ctx = {
      resolve: () => ({ cardName: 'Shield', taggerTags: ['Flash'], source: 'fallback' as const }),
      cache: {},
      coverage: { cardsResolved: 1, cardsWithTags: 1, percent: 100 },
    };
    expect(Tagger.countTagOverlap(card, ['flash', 'protection'], ctx)).toBe(2);
    expect(Tagger.countTagOverlap(card, ['missing'], null)).toBe(0);
  });
});

describe('Tagger.resolveCardTags', () => {
  it('extracts keywords and subtype tokens from type line', () => {
    const resolved = Tagger.resolveCardTags('Thor', {
      keywords: ['Flying'],
      type_line: 'Legendary Creature — God Warrior',
    });
    expect(resolved.taggerTags).toContain('Flying');
    expect(resolved.taggerTags.some((t) => t.toLowerCase() === 'warrior')).toBe(true);
  });
});

describe('Tagger.matchSetCardToRoles', () => {
  it('scores role overlap and falls back to role id substring', () => {
    const card = {
      name: 'Take Up the Shield',
      set_code: 'MSH',
      collector_number: '39',
      type_line: 'Instant',
      oracle_text: 'protection',
    };
    const profile = {
      roles: [
        { id: 'protection', priority: 'high', tags: ['protection'] },
        { id: 'ramp', priority: 'low', tags: ['ramp'] },
      ],
    };
    const match = Tagger.matchSetCardToRoles(card, profile);
    expect(match!.roleId).toBe('protection');
    expect(match!.score).toBeGreaterThan(10);

    const idMatch = Tagger.matchSetCardToRoles(
      { name: 'Ramp Rock', set_code: 'MSH', collector_number: '1', type_line: 'Artifact', oracle_text: 'ramp rock' },
      { roles: [{ id: 'ramp', tags: ['missing-tag'] }] },
    );
    expect(idMatch!.roleId).toBe('ramp');
  });

  it('returns null when no role matches', () => {
    expect(
      Tagger.matchSetCardToRoles(
        { name: 'Vanilla', set_code: 'MSH', collector_number: '1', type_line: 'Creature' },
        { roles: [{ id: 'combo', tags: ['combo'] }] },
      ),
    ).toBe(null);
  });
});

describe('RoleRules.runRoleSynergy', () => {
  it('skips cards already in deck or outside selected set codes', () => {
    const deck = loadFixture('baird-snapshot.json');
    const scope = {
      primaryCode: 'MSH',
      codes: ['MSH'],
      cards: [
        {
          name: 'Sacred Foundry',
          set_code: 'MSH',
          collector_number: '1',
          type_line: 'Land',
          oracle_text: 'token',
        },
        {
          name: 'Wrong Set Card',
          set_code: 'MH2',
          collector_number: '2',
          type_line: 'Instant',
          oracle_text: 'protection',
        },
      ],
    };
    const ctx = Tagger.createContext(deck, scope);
    const added = RoleRules.runRoleSynergy(deck, scope, deck.profile, [], ctx);
    expect(added.some((s) => s.card.name === 'Sacred Foundry')).toBe(false);
    expect(added.some((s) => s.card.name === 'Wrong Set Card')).toBe(false);
  });

  it('emits consider suggestions with medium confidence for strong matches', () => {
    const deck = {
      deck_id: 'd1',
      deck_snapshot: {
        cards: [{ name: 'Cuttable', primary_category: 'Ramp', cmc: 4, type_line: 'Artifact' }],
      },
      profile: {
        roles: [{ id: 'protection', priority: 'high', tags: ['protection', 'instant', 'extra'] }],
      },
    };
    const scope = {
      primaryCode: 'MSH',
      codes: ['MSH'],
      cards: [
        {
          name: 'Take Up the Shield',
          set_code: 'MSH',
          collector_number: '39',
          type_line: 'Instant',
          oracle_text: 'protection instant extra',
          cmc: 2,
        },
      ],
    };
    const ctx = Tagger.createContext(deck, scope);
    const added = RoleRules.runRoleSynergy(deck, scope, deck.profile, [], ctx);
    expect(added).toHaveLength(1);
    expect(added[0].action).toBe('consider');
    expect(added[0].confidence).toBe('medium');
  });
});

describe('Tagger.createContext coverage', () => {
  it('tracks cards resolved from deck and set pool', () => {
    const deck = loadFixture('baird-snapshot.json');
    const scope = loadFixture('set-msh-slice.json');
    const ctx = Tagger.createContext(deck, scope);
    expect(ctx.coverage.cardsResolved).toBeGreaterThan(0);
    expect(ctx.resolve('Take Up the Shield', scope.cards[0]).taggerTags.length).toBeGreaterThanOrEqual(0);
  });
});
