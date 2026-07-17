import fs from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  Data,
  RuleGuards,
  runRulesForDeck,
  Tagger,
} from '../../../packages/web/src/deck-suggest/index.ts';
import { resetHubModules, REPO_ROOT } from '../helpers/hubHarness.ts';

const FIXTURE_DIR = path.join(REPO_ROOT, 'tests/fixtures/deck-suggest');

function loadFixture(name: string) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, name), 'utf8'));
}

function runRules(deck: ReturnType<typeof loadFixture>, setScope: ReturnType<typeof loadFixture>) {
  return runRulesForDeck(deck, setScope, {});
}

beforeEach(() => {
  resetHubModules();
});

afterEach(() => {
  resetHubModules();
});

describe('deck-suggest rules (baird)', () => {
  it("pairs Caretaker's Talent with Plains cut", () => {
    const deck = loadFixture('baird-snapshot.json');
    const setScope = loadFixture('set-msh-slice.json');
    const { suggestions } = runRules(deck, setScope);
    const caretaker = suggestions.find((s) => s.fills_swap_slot === "Caretaker's Talent");
    expect(caretaker).toBeTruthy();
    expect(caretaker!.priority_tier).toBe('swap');
    expect(caretaker!.replaces[0].name).toBe('Plains');
  });

  it('suggests a main-deck cut for unpaired Sunbillow Verge', () => {
    const deck = loadFixture('baird-snapshot.json');
    const setScope = loadFixture('set-msh-slice.json');
    const { suggestions } = runRules(deck, setScope);
    const verge = suggestions.find((s) => s.fills_swap_slot === 'Sunbillow Verge');
    expect(verge).toBeTruthy();
    expect(verge!.card.set_code).toBe('DFT');
    expect(verge!.replaces[0].name).toBeTruthy();
    expect(verge!.replaces[0].name).not.toBe('Plains');
  });

  it('skips stale swap-queue In slots not in the selected set pool', () => {
    const deck = loadFixture('baird-snapshot.json');
    const setScope = loadFixture('set-mh2-slice.json');
    const { suggestions, audit } = runRules(deck, setScope);
    expect(suggestions.some((s) => s.fills_swap_slot === 'Sunbillow Verge')).toBe(false);
    expect(suggestions.some((s) => s.fills_swap_slot === "Caretaker's Talent")).toBe(false);
    expect(audit.some((a) => String(a.skippedReason || '').indexOf('not_in_set_scope') >= 0)).toBe(true);
  });
});

describe('deck-suggest blocklist guards', () => {
  it('never suggests blocked adds', () => {
    const deck = loadFixture('baird-snapshot.json');
    deck.profile.blocked_cards = ['Take Up the Shield'];
    const setScope = loadFixture('set-msh-slice.json');
    setScope.cards.push({
      name: 'Take Up the Shield',
      set_code: 'MSH',
      collector_number: '39',
      type_line: 'Instant',
      oracle_text: 'indestructible',
      cmc: 2,
    });
    const { suggestions } = runRules(deck, setScope);
    expect(suggestions.some((s) => s.card.name === 'Take Up the Shield')).toBe(false);
  });

  it('never cuts protected cards', () => {
    const deck = loadFixture('baird-snapshot.json');
    deck.profile.protected_cards = ['Sacred Foundry'];
    const setScope = loadFixture('set-msh-slice.json');
    const { suggestions } = runRules(deck, setScope);
    suggestions.forEach((s) => {
      (s.replaces || []).forEach((r) => {
        expect(r.name).not.toBe('Sacred Foundry');
      });
    });
  });
});

describe('deck-suggest determinism', () => {
  it('returns identical suggestions on re-run', () => {
    const deck = loadFixture('baird-snapshot.json');
    const setScope = loadFixture('set-msh-slice.json');
    const a = runRules(deck, setScope).suggestions;
    const b = runRules(deck, setScope).suggestions;
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('deck-suggest tagger fallback', () => {
  it('ranks cuts using tag overlap when tagger metadata present', () => {
    const deck = loadFixture('baird-snapshot.json');
    const setScope = loadFixture('set-msh-slice.json');
    const ctx = Tagger.createContext(deck, setScope);
    const ranked = RuleGuards.rankCutCandidates(RuleGuards.cutCandidates(deck), deck.profile, ctx);
    expect(ranked.length).toBeGreaterThan(0);
  });

  it('falls back when tagger metadata absent on candidates', () => {
    const deck = loadFixture('baird-snapshot.json');
    const setScope = { primaryCode: 'MSH', codes: ['MSH'], cards: [] };
    const { suggestions, audit, taggerCoverage } = runRules(deck, setScope);
    expect(taggerCoverage).toBeTruthy();
    expect(suggestions.filter((s) => s.priority_tier === 'swap')).toHaveLength(0);
    expect(audit.some((a) => String(a.skippedReason || '').indexOf('not_in_set_scope') >= 0)).toBe(true);
  });
});

describe('deck-suggest commander eligibility', () => {
  it('skips cube decks by name', () => {
    const deck = loadFixture('baird-snapshot.json');
    deck.deck_name = 'My Vintage Cube';
    const result = Data.resolveDeckEligibility(deck);
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('cube_or_non_commander');
  });
});
