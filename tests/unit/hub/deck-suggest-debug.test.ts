import fs from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Debug, runRulesForDeck, rulesDebugEnabled } from '../../../packages/web/src/deck-suggest/index.ts';
import { isLocalHub } from '../../../packages/web/src/lib/hub-utils.ts';
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

describe('isLocalHub', () => {
  it('returns true on localhost', () => {
    const original = window.location.hostname;
    Object.defineProperty(window.location, 'hostname', { value: 'localhost', configurable: true });
    expect(isLocalHub()).toBe(true);
    Object.defineProperty(window.location, 'hostname', { value: original, configurable: true });
  });

  it('returns false on github.io', () => {
    const original = window.location.hostname;
    Object.defineProperty(window.location, 'hostname', { value: 'rayenz.github.io', configurable: true });
    expect(isLocalHub()).toBe(false);
    Object.defineProperty(window.location, 'hostname', { value: original, configurable: true });
  });
});

describe('Debug', () => {
  it('rejectReason reports blocked_add', () => {
    const suggestion = {
      suggestion_id: 'x-001',
      action: 'replace',
      card: { name: 'Sol Ring' },
      quantity: 1,
      roles_matched: [],
      confidence: 'high',
      rationale: '',
      tags: [],
      replaces: [{ name: 'Plains', quantity: 1 }],
      priority_tier: 'normal',
    };
    const profile = { blocked_cards: ['Sol Ring'] };
    expect(Debug.rejectReason(suggestion, profile, [])).toBe('blocked_add');
  });

  it('formatReason includes rule id and label', () => {
    const text = Debug.formatReason({
      ruleId: 'queue_in_pair',
      subject: 'Sunbillow Verge',
      reason: 'not_in_set_scope',
    });
    expect(text).toContain('queue_in_pair');
    expect(text).toContain('Sunbillow Verge');
    expect(text).toContain('not in selected set pool');
  });

  it('explainCard reports not_in_set_scope for stale queue In', () => {
    const deck = loadFixture('baird-snapshot.json');
    const setScope = loadFixture('set-mh2-slice.json');
    const lines = Debug.explainCard(deck, setScope, 'Sunbillow Verge');
    expect(lines.some((line) => line.reason === 'not_in_set_scope')).toBe(true);
  });

  it('createCollector filterByCard matches subject, in, and out fields', () => {
    const collector = Debug.createCollector('d1');
    collector.push({ ruleId: 'r1', subject: 'Sunbillow Verge', reason: 'test' });
    collector.push({ ruleId: 'r2', cardOut: 'Plains', reason: 'test' });
    expect(collector.filterByCard('verge')).toHaveLength(1);
    expect(collector.filterByCard('')).toHaveLength(2);
    expect(collector.entries()).toHaveLength(2);
  });

  it('rejectReason covers protected_cut, duplicate_pair, and invalid suggestions', () => {
    expect(Debug.rejectReason(null, {}, [])).toBe('invalid_suggestion');
    const protectedCut = {
      suggestion_id: 'x',
      action: 'replace',
      card: { name: 'New' },
      quantity: 1,
      roles_matched: [],
      confidence: 'high',
      rationale: '',
      tags: [],
      replaces: [{ name: 'Sacred Foundry', quantity: 1 }],
      priority_tier: 'normal',
    };
    const deck = loadFixture('baird-snapshot.json');
    expect(Debug.rejectReason(protectedCut, { protected_cards: ['Sacred Foundry'] }, [])).toBe('protected_cut');
    const dup = {
      ...protectedCut,
      replaces: [{ name: 'Plains', quantity: 1 }],
      card: { name: 'Sol Ring' },
    };
    const existing = [{ ...dup, suggestion_id: 'y' }];
    expect(Debug.rejectReason(dup, {}, existing)).toBe('duplicate_pair');
  });

  it('formatReason includes detail and distinct cardIn label', () => {
    const text = Debug.formatReason({
      ruleId: 'role_synergy',
      subject: 'Bolt',
      reason: 'role_no_match',
      cardIn: 'Lightning Bolt',
      cardOut: 'Shock',
      detail: 'No overlap',
    });
    expect(text).toContain('Lightning Bolt');
    expect(text).toContain('Shock');
    expect(text).toContain('No overlap');
    expect(Debug.formatReason({ reason: 'unknown_reason' })).toContain('unknown_reason');
  });

  it('explainCard walks queue, proxy, and role branches', () => {
    const deck = loadFixture('baird-snapshot.json');
    const setScope = loadFixture('set-msh-slice.json');
    expect(Debug.explainCard(deck, setScope, '')).toEqual([]);
    const unpaired = Debug.explainCard(deck, setScope, 'Sunbillow Verge');
    expect(unpaired.some((l) => l.reason === 'would_emit' && l.cardOut)).toBe(true);
    const role = Debug.explainCard(deck, setScope, 'Take Up the Shield');
    expect(role.some((l) => l.ruleId === 'role_synergy')).toBe(true);

    const proxyDeck = {
      deck_id: 'proxy',
      deck_snapshot: {
        cards: [{ name: 'Plateau', categories: ['Proxies'], primary_category: 'Proxies' }],
      },
      profile: deck.profile,
    };
    const proxyScope = {
      ...setScope,
      cards: [...setScope.cards, { name: 'Plateau', set_code: 'MSH', collector_number: '999' }],
    };
    const proxyLines = Debug.explainCard(proxyDeck, proxyScope, 'Plateau');
    expect(proxyLines.some((l) => l.ruleId === 'proxy_upgrade')).toBe(true);

    const extraOutDeck = {
      deck_id: 'extra-out',
      deck_snapshot: {
        cards: [
          { name: 'In Card', primary_category: 'New Set In' },
          { name: 'Extra Out A', primary_category: 'New Set Out' },
          { name: 'Extra Out B', primary_category: 'New Set Out' },
        ],
      },
      profile: deck.profile,
    };
    const outLines = Debug.explainCard(extraOutDeck, setScope, 'Extra Out B');
    expect(outLines.some((l) => l.ruleId === 'queue_out_fill')).toBe(true);
  });

  it('explainCard reports no_swap_queue without snapshot and role_already_in_deck', () => {
    const deck = { deck_id: 'd1', profile: {} };
    const scope = {
      ...loadFixture('set-msh-slice.json'),
      cards: [...loadFixture('set-msh-slice.json').cards, { name: 'Sol Ring', set_code: 'MSH', collector_number: '99', type_line: 'Artifact' }],
    };
    const deckWithCard = {
      deck_id: 'd1',
      profile: {},
      deck_snapshot: { cards: [{ name: 'Sol Ring', primary_category: 'Ramp' }] },
    };
    const lines = Debug.explainCard(deck, scope, 'Sol Ring');
    expect(lines.some((l) => l.reason === 'no_swap_queue')).toBe(true);
    expect(Debug.explainCard(deckWithCard, scope, 'Sol Ring').some((l) => l.reason === 'role_already_in_deck')).toBe(true);
  });
});

describe('runRulesForDeck debug trace', () => {
  it('returns debugTrace when debug option is true', () => {
    const deck = loadFixture('baird-snapshot.json');
    const setScope = loadFixture('set-mh2-slice.json');
    const output = runRulesForDeck(deck, setScope, { debug: true });
    expect(output.debugTrace).toBeTruthy();
    expect(output.debugTrace!.length).toBeGreaterThan(0);
    expect(output.debugTrace!.some((e) => e.reason === 'not_in_set_scope')).toBe(true);
  });

  it('omits debugTrace when debug option is false', () => {
    const deck = loadFixture('baird-snapshot.json');
    const setScope = loadFixture('set-mh2-slice.json');
    const output = runRulesForDeck(deck, setScope, { debug: false });
    expect(output.debugTrace).toBeNull();
  });
});

describe('rulesDebugEnabled', () => {
  it('is false when not on localhost even if setting is on', () => {
    const original = window.location.hostname;
    Object.defineProperty(window.location, 'hostname', { value: 'rayenz.github.io', configurable: true });
    expect(rulesDebugEnabled({ rulesDebug: true })).toBe(false);
    Object.defineProperty(window.location, 'hostname', { value: original, configurable: true });
  });

  it('is true on localhost when setting is on', () => {
    const original = window.location.hostname;
    Object.defineProperty(window.location, 'hostname', { value: 'localhost', configurable: true });
    expect(rulesDebugEnabled({ rulesDebug: true })).toBe(true);
    Object.defineProperty(window.location, 'hostname', { value: original, configurable: true });
  });
});
