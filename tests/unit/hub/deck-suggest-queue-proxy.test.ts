import fs from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Data, ProxyRules, QueueRules, Tagger } from '../../../packages/web/src/deck-suggest/index.ts';
import { buildSwapQueueAnalysis, sortSuggestions } from '../../../packages/web/src/deck-suggest/rules.ts';
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

describe('rules queue analysis', () => {
  it('buildSwapQueueAnalysis reports unpaired queue slots', () => {
    const deck = {
      deck_id: 'd1',
      deck_snapshot: {
        cards: [
          { name: 'In1', primary_category: 'Queued In' },
          { name: 'In2', primary_category: 'Queued In' },
          { name: 'Out1', primary_category: 'Queued Out' },
        ],
      },
    };
    const analysis = buildSwapQueueAnalysis(deck);
    expect(analysis?.unpaired_in).toContain('In2');
    expect(analysis?.reconciliation_notes?.[0]).toContain('no Out paired');
    expect(buildSwapQueueAnalysis({ deck_id: 'empty' })).toBe(null);
  });

  it('sortSuggestions orders swap tier and confidence', () => {
    const sorted = sortSuggestions([
      { suggestion_id: 'b', priority_tier: 'normal', confidence: 'low' },
      { suggestion_id: 'a', priority_tier: 'swap', confidence: 'high' },
    ] as never);
    expect(sorted[0].priority_tier).toBe('swap');
  });
});

describe('QueueRules.pickCutForUnpairedIn', () => {
  it('prefers land cuts when queued In is a land', () => {
    const deck = loadFixture('baird-snapshot.json');
    Data.buildDeckRuleContext(deck);
    const ctx = Tagger.createContext(deck, loadFixture('set-msh-slice.json'));
    const cut = QueueRules.pickCutForUnpairedIn(
      deck,
      deck.profile,
      ctx,
      { name: 'Sunbillow Verge', type_line: 'Land' },
    );
    expect(cut!.primary_category).toBe('Land');
  });

  it('falls back to all candidates when no land cuts exist', () => {
    const deck = {
      deck_id: 'd1',
      deck_snapshot: {
        cards: [
          { name: 'Island', primary_category: 'Queued In', type_line: 'Land' },
          { name: 'Sol Ring', primary_category: 'Ramp', cmc: 1 },
        ],
      },
    };
    const ctx = Tagger.createContext(deck, { codes: ['MSH'], cards: [] });
    const cut = QueueRules.pickCutForUnpairedIn(deck, {}, ctx, { name: 'Plains', type_line: 'Land' });
    expect(cut!.name).toBe('Sol Ring');
  });
});

describe('QueueRules.runQueueInPair', () => {
  it('records no_swap_queue when deck has no snapshot queue', () => {
    const deck = { deck_id: 'd1', deck_name: 'Empty' };
    const scope = loadFixture('set-msh-slice.json');
    const entries: unknown[] = [];
    const result = QueueRules.runQueueInPair(deck, scope, {}, [], Tagger.createContext(deck, scope), {
      collector: { push: (e) => entries.push(e) },
    });
    expect(result.added).toEqual([]);
    expect(entries.some((e) => (e as { reason: string }).reason === 'no_swap_queue')).toBe(true);
  });

  it('skips queue In cards missing from set pool', () => {
    const deck = loadFixture('baird-snapshot.json');
    const scope = loadFixture('set-mh2-slice.json');
    const ctx = Tagger.createContext(deck, scope);
    const result = QueueRules.runQueueInPair(deck, scope, deck.profile, [], ctx);
    expect(result.skipped.some((s) => s.reason === 'not_in_set_scope')).toBe(true);
  });

  it('emits paired swap suggestions from fixture queue', () => {
    const deck = loadFixture('baird-snapshot.json');
    const scope = loadFixture('set-msh-slice.json');
    const ctx = Tagger.createContext(deck, scope);
    const result = QueueRules.runQueueInPair(deck, scope, deck.profile, [], ctx);
    expect(result.added.some((s) => s.fills_swap_slot === "Caretaker's Talent")).toBe(true);
  });
});

describe('QueueRules.runQueueOutFill', () => {
  it('returns empty when Out count does not exceed In count', () => {
    const deck = loadFixture('baird-snapshot.json');
    const scope = loadFixture('set-msh-slice.json');
    const ctx = Tagger.createContext(deck, scope);
    const entries: unknown[] = [];
    const added = QueueRules.runQueueOutFill(deck, scope, deck.profile, [], ctx, {
      collector: { push: (e) => entries.push(e) },
    });
    expect(added).toEqual([]);
    expect(entries.some((e) => (e as { reason: string }).reason === 'queue_out_not_applicable')).toBe(true);
  });

  it('suggests replacement for extra Out slots', () => {
    const deck = {
      deck_id: 'd1',
      deck_snapshot: {
        cards: [
          { name: 'Queued In', primary_category: 'Queued In' },
          { name: 'Extra Out A', primary_category: 'Queued Out' },
          { name: 'Extra Out B', primary_category: 'Queued Out' },
          { name: 'Cut Me', primary_category: 'Ramp', cmc: 3, type_line: 'Instant', oracle_text: 'protection token' },
        ],
      },
      profile: {
        roles: [{ id: 'protection', priority: 'high', tags: ['protection'] }],
      },
    };
    const scope = Data.indexSetPool({
      primaryCode: 'MSH',
      codes: ['MSH'],
      cards: [
        {
          name: 'Take Up the Shield',
          set_code: 'MSH',
          collector_number: '39',
          type_line: 'Instant',
          oracle_text: 'protection',
          cmc: 2,
        },
      ],
    })!;
    const ctx = Tagger.createContext(deck, scope);
    const added = QueueRules.runQueueOutFill(deck, scope, deck.profile, [], ctx);
    expect(added.some((s) => s.card.name === 'Take Up the Shield')).toBe(true);
  });

  it('returns empty when deck has no swap queue', () => {
    const deck = { deck_id: 'd1' };
    const scope = loadFixture('set-msh-slice.json');
    const added = QueueRules.runQueueOutFill(deck, scope, {}, [], Tagger.createContext(deck, scope));
    expect(added).toEqual([]);
  });

  it('findSetReplacement skips cards already in deck snapshot', () => {
    const deck = {
      deck_id: 'd1',
      deck_snapshot: { cards: [{ name: 'Take Up the Shield', primary_category: 'Instant' }] },
      profile: { roles: [{ id: 'protection', tags: ['protection'] }] },
    };
    const scope = Data.indexSetPool({
      primaryCode: 'MSH',
      codes: ['MSH'],
      cards: [{ name: 'Take Up the Shield', set_code: 'MSH', collector_number: '39', type_line: 'Instant', oracle_text: 'protection' }],
    })!;
    const match = QueueRules.findSetReplacement(deck, { name: 'Out' }, scope, deck.profile, Tagger.createContext(deck, scope));
    expect(match).toBe(null);
  });

  it('skips extra Out when no role-matched replacement exists', () => {
    const deck = {
      deck_id: 'd1',
      deck_snapshot: {
        cards: [
          { name: 'Queued In', primary_category: 'Queued In' },
          { name: 'Extra Out A', primary_category: 'Queued Out' },
          { name: 'Extra Out B', primary_category: 'Queued Out' },
        ],
      },
      profile: { roles: [{ id: 'ramp', tags: ['ramp'] }] },
    };
    const scope = Data.indexSetPool({
      primaryCode: 'MSH',
      codes: ['MSH'],
      cards: [{ name: 'Unrelated', set_code: 'MSH', collector_number: '1', type_line: 'Artifact', oracle_text: '' }],
    })!;
    const ctx = Tagger.createContext(deck, scope);
    const entries: unknown[] = [];
    QueueRules.runQueueOutFill(deck, scope, deck.profile, [], ctx, {
      collector: { push: (e) => entries.push(e) },
    });
    expect(entries.some((e) => (e as { reason: string }).reason === 'queue_out_no_replacement')).toBe(true);
  });
});

describe('ProxyRules', () => {
  it('detects proxy cards by category', () => {
    expect(ProxyRules.isProxyCard({ categories: ['Land', 'Proxies'] })).toBe(true);
    expect(ProxyRules.isProxyCard({ primary_category: 'Proxies' })).toBe(true);
    expect(ProxyRules.isProxyCard({ primary_category: 'Land' })).toBe(false);
  });

  it('skips proxy cards without an official printing in scope', () => {
    const deck = {
      deck_id: 'd1',
      deck_snapshot: {
        cards: [{ name: 'Plateau', categories: ['Land', 'Proxies'], primary_category: 'Land' }],
      },
    };
    const scope = Data.indexSetPool({ primaryCode: 'MSH', codes: ['MSH'], cards: [] })!;
    const entries: unknown[] = [];
    const added = ProxyRules.runProxyUpgrade(deck, scope, {}, [], Tagger.createContext(deck, scope), {
      collector: { push: (e) => entries.push(e) },
    });
    expect(added).toEqual([]);
    expect(entries.some((e) => (e as { reason: string }).reason === 'proxy_no_official_in_scope')).toBe(true);
  });

  it('emits proxy upgrade when official printing exists in pool', () => {
    const deck = {
      deck_id: 'd1',
      deck_snapshot: {
        cards: [{ name: 'Plateau', categories: ['Proxies'], primary_category: 'Proxies' }],
      },
    };
    const scope = Data.indexSetPool({
      primaryCode: 'MSH',
      codes: ['MSH'],
      cards: [
        { name: 'Plateau', set_code: 'MSH', collector_number: '100' },
        { name: 'Plateau', set_code: 'MSH', collector_number: '50' },
      ],
    })!;
    const added = ProxyRules.runProxyUpgrade(deck, scope, {}, [], Tagger.createContext(deck, scope));
    expect(added).toHaveLength(1);
    expect(added[0].card.collector_number).toBe('100');
    expect(added[0].replaces![0].name).toBe('Plateau');
  });
});
