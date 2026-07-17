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
