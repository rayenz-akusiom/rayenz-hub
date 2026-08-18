import fs from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RuleGuards } from '../../../packages/shared/src/suggest/index.ts';
import { resetHubModules, REPO_ROOT } from '../helpers/hubHarness.ts';

const FIXTURE_DIR = path.join(REPO_ROOT, 'tests/fixtures/deck-suggest');

function loadFixture(name: string) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, name), 'utf8'));
}

function baseSuggestion(overrides: Record<string, unknown> = {}) {
  return {
    suggestion_id: 'd-001',
    action: 'replace',
    card: { name: 'Sol Ring', set_code: 'MSH', collector_number: '1' },
    quantity: 1,
    roles_matched: [],
    confidence: 'high',
    rationale: '',
    tags: [],
    replaces: [{ name: 'Plains', quantity: 1 }],
    priority_tier: 'normal',
    ...overrides,
  };
}

beforeEach(() => {
  resetHubModules();
});

afterEach(() => {
  resetHubModules();
});

describe('RuleGuards helpers', () => {
  it('listHasName is case-insensitive and tolerates missing lists', () => {
    expect(RuleGuards.listHasName(undefined, 'Sol Ring')).toBe(false);
    expect(RuleGuards.listHasName(['sol ring'], 'Sol Ring')).toBe(true);
  });

  it('normalizeProfile fills defaults for null profile', () => {
    expect(RuleGuards.normalizeProfile(null)).toEqual({
      roles: [],
      tags: [],
      protected_cards: [],
      blocked_cards: [],
      typal_types: [],
      themes: [],
      keyword_interests: [],
      art_tags: [],
      constraints: {},
    });
  });

  it('isCommanderCategory detects protected primary categories', () => {
    expect(RuleGuards.isCommanderCategory({ primary_category: 'Commander' })).toBe(true);
    expect(RuleGuards.isCommanderCategory({ categories: ['Lieutenant'] })).toBe(true);
    expect(RuleGuards.isCommanderCategory({ primary_category: 'Ramp' })).toBe(false);
    expect(RuleGuards.isCommanderCategory(null)).toBe(false);
  });

  it('passesBlocklist rejects invalid, blocked, and protected suggestions', () => {
    expect(RuleGuards.passesBlocklist(null, {})).toBe(false);
    expect(RuleGuards.passesBlocklist({ card: null }, {})).toBe(false);
    const blocked = baseSuggestion({ card: { name: 'Sol Ring' } });
    expect(RuleGuards.passesBlocklist(blocked, { blocked_cards: ['Sol Ring'] })).toBe(false);
    const protectedCut = baseSuggestion({ replaces: [{ name: 'Plains' }] });
    expect(RuleGuards.passesBlocklist(protectedCut, { protected_cards: ['Plains'] })).toBe(false);
    expect(RuleGuards.passesBlocklist(baseSuggestion(), {})).toBe(true);
  });

  it('deckNamesInSnapshot prefers ruleContext cache', () => {
    const deck = {
      deck_id: 'd1',
      ruleContext: { deckNames: { 'cached card': true } },
      deck_snapshot: { cards: [{ name: 'Snapshot Card' }] },
    };
    expect(RuleGuards.deckNamesInSnapshot(deck)).toEqual({ 'cached card': true });
  });

  it('cutCandidates skips protected, swap-queue, duplicate, and caches on ruleContext', () => {
    const deck = {
      deck_id: 'd1',
      ruleContext: { version: 1 },
      deck_snapshot: {
        cards: [
          { name: 'Commander', primary_category: 'Commander' },
          { name: 'Queued In', primary_category: 'Queued In' },
          { name: 'Queued Out', primary_category: 'Queued Out' },
          { name: 'Sol Ring', primary_category: 'Ramp', cmc: 1 },
          { name: 'Sol Ring', primary_category: 'Ramp', cmc: 1 },
          { name: '', primary_category: 'Ramp' },
        ],
      },
    };
    const first = RuleGuards.cutCandidates(deck);
    const second = RuleGuards.cutCandidates(deck);
    expect(first.map((c) => c.name)).toEqual(['Sol Ring']);
    expect(second).toBe(deck.ruleContext!.cutCandidates);
  });

  it('rankCutCandidates breaks ties by role priority, cmc, and name', () => {
    const candidates = [
      { name: 'Zebra', cmc: 3, type_line: 'Creature', oracle_text: 'token' },
      { name: 'Alpha', cmc: 5, type_line: 'Instant', oracle_text: 'protection' },
      { name: 'Beta', cmc: 5, type_line: 'Instant', oracle_text: 'other' },
    ];
    const profile = {
      roles: [
        { id: 'finisher', priority: 'high', tags: ['protection'] },
        { id: 'tokens', priority: 'medium', tags: ['token'] },
      ],
      tags: ['token'],
    };
    const ranked = RuleGuards.rankCutCandidates(candidates, profile, null);
    expect(ranked[0].name).toBe('Beta');
    expect(ranked.map((c) => c.name)).toContain('Zebra');
    expect(ranked.map((c) => c.name)).toContain('Alpha');
  });

  it('pickBestCut returns null when no candidates remain', () => {
    const deck = {
      deck_id: 'd1',
      deck_snapshot: { cards: [{ name: 'Cmd', primary_category: 'Commander' }] },
    };
    expect(RuleGuards.pickBestCut(deck, {}, null)).toBe(null);
  });

  it('hasDuplicate and nextSuggestionId track pair keys and numeric suffixes', () => {
    const existing = [baseSuggestion({ suggestion_id: 'd-003' })];
    const dup = baseSuggestion({ card: { name: 'Sol Ring' }, replaces: [{ name: 'Plains' }] });
    expect(RuleGuards.hasDuplicate(existing, dup)).toBe(true);
    expect(RuleGuards.nextSuggestionId('deck-a', existing)).toBe('deck-a-004');
    expect(RuleGuards.nextSuggestionId('deck-a', [])).toBe('deck-a-001');
  });

  it('snapshotCardToSuggestionCard and setCardToSuggestionCard normalize fields', () => {
    const snap = RuleGuards.snapshotCardToSuggestionCard({
      name: 'Bolt',
      set_code: 'mh2',
      collector_number: 42,
      cmc: 1,
      type_line: 'Instant',
    });
    expect(snap.set_code).toBe('MH2');
    expect(snap.collector_number).toBe('42');
    const pool = RuleGuards.setCardToSuggestionCard({
      name: 'Bolt',
      set_code: 'mh2',
      collector_number: 42,
      scryfall_id: 'id-1',
      scryfall_uri: 'https://example.com',
      mana_cost: '{R}',
      cmc: 1,
      type_line: 'Instant',
    });
    expect(pool.scryfall_id).toBe('id-1');
  });

  it('findInSetPool prefers primary set code and falls back to linear scan', () => {
    const indexed = {
      primaryCode: 'MSH',
      codes: ['MSH'],
      cardsByName: {
        'sol ring': [
          { name: 'Sol Ring', set_code: 'CMM', collector_number: '1' },
          { name: 'Sol Ring', set_code: 'MSH', collector_number: '2' },
        ],
      },
      cards: [],
    };
    expect(RuleGuards.findInSetPool('Sol Ring', indexed)!.set_code).toBe('MSH');
    const linear = {
      primaryCode: 'MSH',
      codes: ['MSH'],
      cards: [{ name: 'Lightning Bolt', set_code: 'MSH', collector_number: '1' }],
    };
    expect(RuleGuards.findInSetPool('Lightning Bolt', linear)!.name).toBe('Lightning Bolt');
    expect(RuleGuards.findInSetPool('Missing', linear)).toBe(null);
  });

  it('resolveQueuedInForScope returns null when card is absent from pool', () => {
    const scope = loadFixture('set-msh-slice.json');
    expect(RuleGuards.resolveQueuedInForScope({ name: 'Missing Card' }, scope)).toBe(null);
    expect(RuleGuards.resolveQueuedInForScope({ name: "Caretaker's Talent" }, scope)!.set_code).toBeTruthy();
  });
});

describe('RuleGuards.emitIfValid', () => {
  it('uses custom rejectReasonFn when provided', () => {
    const suggestion = baseSuggestion();
    const rejected = RuleGuards.emitIfValid(
      suggestion,
      {},
      [],
      null,
      () => 'custom_reason',
    );
    expect(rejected).toBe(null);
  });

  it('rejects duplicates and records debug entries', () => {
    const suggestion = baseSuggestion();
    const existing = [baseSuggestion()];
    const collector = { push: (entry: unknown) => entries.push(entry) };
    const entries: unknown[] = [];
    const rejected = RuleGuards.emitIfValid(suggestion, {}, existing, {
      ruleId: 'test_rule',
      collector,
    });
    expect(rejected).toBe(null);
    expect(entries).toHaveLength(1);
    expect((entries[0] as { reason: string }).reason).toBe('duplicate_pair');
  });

  it('returns suggestion when valid', () => {
    const suggestion = baseSuggestion({ card: { name: 'New Card' }, replaces: [{ name: 'Cut Me' }] });
    expect(RuleGuards.emitIfValid(suggestion, {}, [])).toEqual(suggestion);
  });
});

describe('RuleGuards owned / queue badges / header', () => {
  it('ownedNamesInSnapshot omits Seeking and Queued In', () => {
    const deck = {
      deck_id: 'd1',
      deck_name: 'Test',
      deck_snapshot: {
        cards: [
          { name: 'Main Card', primary_category: 'Ramp' },
          { name: 'Seek Me', primary_category: 'Seeking' },
          { name: 'Queued Add', primary_category: 'Queued In' },
          { name: 'Queued Cut', primary_category: 'Queued Out' },
        ],
      },
    };
    const owned = RuleGuards.ownedNamesInSnapshot(deck);
    expect(owned['main card']).toBe(true);
    expect(owned['queued cut']).toBe(true);
    expect(owned['seek me']).toBeUndefined();
    expect(owned['queued add']).toBeUndefined();
  });

  it('suggestQueueBadge prefers In swap over Seeking', () => {
    const deck = {
      deck_id: 'd1',
      deck_name: 'Test',
      deck_snapshot: {
        cards: [
          { name: 'Seek Me', primary_category: 'Seeking' },
          { name: 'Swap Me', primary_category: 'Queued In' },
        ],
      },
    };
    expect(RuleGuards.suggestQueueBadge(deck, 'Seek Me')).toBe('seeking');
    expect(RuleGuards.suggestQueueBadge(deck, 'Swap Me')).toBe('swap_in');
    expect(RuleGuards.suggestQueueBadge(deck, 'Missing')).toBe(null);
  });

  it('deckSuggestHeaderText appends commanders', () => {
    const deck = {
      deck_id: 'd1',
      deck_name: 'Elves',
      deck_snapshot: {
        cards: [
          { name: 'Lathril', primary_category: 'Commander' },
          { name: 'Partner', primary_category: 'Commander' },
          { name: 'Other', primary_category: 'Creature' },
        ],
      },
    };
    expect(RuleGuards.deckSuggestHeaderText(deck)).toBe('Elves — Lathril / Partner');
    expect(RuleGuards.deckSuggestHeaderText({ deck_id: 'x', deck_name: 'Solo' })).toBe('Solo');
  });
});
