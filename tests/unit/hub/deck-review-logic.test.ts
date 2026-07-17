import fs from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildAcceptedSwap,
  acceptedForDeck,
  decisionRecapInOut,
  decisionStatusClass,
  decisionStatusLabel,
  decisionStatusText,
  getDecision,
  allAcceptedByDeck,
} from '../../../packages/web/src/deck-review/decisions.ts';
import {
  archidektApplyOpenUrl,
  cutOptionImageSrc,
  cutOptionLines,
  defaultOutKeyForSuggestion,
  findSnapshotCard,
  formatSwapQueueItem,
  getSuggestionStaleness,
  getSwapQueueReconciliation,
  hasSuggestedCut,
  isMissingSuggestedCut,
  needsSuggestedCut,
  optionLabel,
  printOptionLines,
  printingLabel,
  printingToCardIn,
  resolveDefaultCutKey,
} from '../../../packages/web/src/deck-review/data.ts';
import {
  buildCutPickerItems,
  buildPrintPickerItems,
  cutMetaFromKey,
  cutSummaryLabel,
  deckCutOptions,
  openCutPicker,
  openPrintPicker,
  printSummaryLabel,
} from '../../../packages/web/src/deck-review/pickers.ts';
import {
  addRuntimePreference as addPref,
  getDeckPreferences,
  isSuggestionFiltered,
  prefCountsLabel,
  selectedInCardName,
} from '../../../packages/web/src/deck-review/profiles.ts';
import {
  allVisibleSuggestions,
  applyLoadedSuggestions,
  createInitialReviewState,
  currentSuggestion,
  deckProgressCounts,
  deckSuggestionCount,
  getDeckById,
  handoffSnapshotDate,
  handoffStatusMessage,
  pendingSuggestions,
  recordDecision,
  refreshAllDecksLabel,
  refreshAllDecksTitle,
  selectDeck,
  showDownloadJson,
  sortDecksByName,
} from '../../../packages/web/src/deck-review/review.ts';
import { deckFromFixture, loadSuggestionFixture } from '../helpers/fixtureLoader.ts';
import { resetHubModules } from '../helpers/hubHarness.ts';

const FIXTURE_NAME = 'msh-2026-06-21.json';

beforeEach(() => {
  resetHubModules();
});

afterEach(() => {
  resetHubModules();
});

describe('deck-review data helpers', () => {
  it('archidektApplyOpenUrl appends rayenz_apply query param', () => {
    expect(archidektApplyOpenUrl('')).toBe('');
    expect(archidektApplyOpenUrl('https://archidekt.com/decks/1')).toContain('rayenz_apply=1');
    expect(archidektApplyOpenUrl('https://archidekt.com/decks/1?edit=1')).toContain('&rayenz_apply=1');
  });

  it('formatSwapQueueItem includes printing when available', () => {
    expect(formatSwapQueueItem({ name: 'Bolt', set_code: 'MH2', collector_number: '1' })).toContain('MH2 #1');
    expect(formatSwapQueueItem({ name: 'Bolt' })).toBe('Bolt');
  });

  it('getSuggestionStaleness covers queued_in and queued_out levels', () => {
    const deck = {
      deck_snapshot: {
        cards: [
          { name: 'Only In', primary_category: 'New Set In' },
          { name: 'Only Out', primary_category: 'New Set Out' },
        ],
      },
      suggestions: [],
    };
    const inOnly = getSuggestionStaleness(deck, {
      card: { name: 'Only In' },
      fills_swap_slot: 'Only In',
      replaces: [{ name: 'Missing Out' }],
    });
    expect(inOnly.level).toBe('queued_in');
    const outOnly = getSuggestionStaleness(deck, {
      card: { name: 'Replacement' },
      replaces: [{ name: 'Only Out' }],
    });
    expect(outOnly.level).toBe('queued_out');
    expect(getSuggestionStaleness({ deck_snapshot: { cards: [] } }, { card: { name: 'X' } }).stale).toBe(false);
  });

  it('getSwapQueueReconciliation reports uncovered and unpaired Out slots', () => {
    const deck = {
      deck_snapshot: {
        cards: [
          { name: 'In1', primary_category: 'New Set In' },
          { name: 'Out1', primary_category: 'New Set Out' },
          { name: 'Out2', primary_category: 'New Set Out' },
        ],
      },
      suggestions: [{ suggestion_id: 's1', card: { name: 'Cover In' }, fills_swap_slot: 'In1', replaces: [] }],
    };
    const recon = getSwapQueueReconciliation(deck);
    expect(recon.uncoveredOut).toContain('Out1');
    expect(recon.unpairedOut).toContain('Out2');
  });

  it('findSnapshotCard prefers exact printing match', () => {
    const deck = {
      deck_snapshot: {
        cards: [
          { name: 'Bolt', set_code: 'MH2', collector_number: '1' },
          { name: 'Bolt', set_code: 'LEA', collector_number: '2' },
        ],
      },
    };
    expect(findSnapshotCard(deck, 'Bolt', 'LEA', '2')!.set_code).toBe('LEA');
    expect(findSnapshotCard(deck, 'Missing')).toBe(null);
    expect(findSnapshotCard({ deck_id: 'd1' }, 'Bolt')).toBe(null);
  });

  it('getSuggestionStaleness covers fully_queued and empty queue', () => {
    const deck = {
      deck_snapshot: {
        cards: [
          { name: 'In Card', primary_category: 'New Set In' },
          { name: 'Out Card', primary_category: 'New Set Out' },
        ],
      },
      suggestions: [],
    };
    const fullyQueued = getSuggestionStaleness(deck, {
      card: { name: 'In Card' },
      fills_swap_slot: 'In Card',
      replaces: [{ name: 'Out Card' }],
    });
    expect(fullyQueued.level).toBe('fully_queued');
    expect(fullyQueued.stale).toBe(true);
    expect(getSuggestionStaleness({ deck_snapshot: { cards: [] } }, { card: { name: 'X' } }).level).toBe('');
  });

  it('getSwapQueueReconciliation reports uncovered In and unpaired In slots', () => {
    const deck = {
      deck_snapshot: {
        cards: [
          { name: 'Uncovered In', primary_category: 'New Set In' },
          { name: 'Paired Out', primary_category: 'New Set Out' },
        ],
      },
      suggestions: [{ suggestion_id: 's1', overrides_queue_in: 'Uncovered In', replaces: [] }],
    };
    const recon = getSwapQueueReconciliation(deck);
    expect(recon.uncoveredOut).toContain('Paired Out');
    const unpairedDeck = {
      deck_snapshot: {
        cards: [
          { name: 'In1', primary_category: 'New Set In' },
          { name: 'In2', primary_category: 'New Set In' },
        ],
      },
      suggestions: [],
    };
    expect(getSwapQueueReconciliation(unpairedDeck).unpairedIn).toContain('In2');
    expect(getSwapQueueReconciliation({ deck_snapshot: { cards: [] } })).toEqual({
      uncoveredIn: [],
      uncoveredOut: [],
      unpairedIn: [],
      unpairedOut: [],
    });
  });

  it('cut helpers and printing labels cover fallback branches', () => {
    expect(hasSuggestedCut({ replaces: [{ name: 'Bolt' }] })).toBe(true);
    expect(needsSuggestedCut({ action: 'sideboard', replaces: [] })).toBe(false);
    expect(isMissingSuggestedCut({ action: 'replace', replaces: [] })).toBe(true);
    expect(optionLabel({ name: 'Bolt' })).toBe('Bolt');
    expect(printingLabel({ name: 'Bolt', set: 'MH2', collector_number: '1' })).toContain('MH2 #1');
    expect(printOptionLines({ name: 'Bolt' })).toEqual([' #']);
    expect(printOptionLines({ name: 'Bolt', set_name: 'Modern Horizons 2', collector_number: '1' })).toEqual([
      'Modern Horizons 2 #1',
    ]);
    expect(cutOptionLines({ name: 'Bolt' })).toEqual(['Bolt']);
    const deck = { deck_snapshot: { cards: [{ name: 'Bolt', set_code: 'MH2', collector_number: '1' }] } };
    expect(cutOptionImageSrc({ name: 'Bolt' }, deck)).toContain('scryfall');
    expect(findSnapshotCard(deck, 'Bolt', 'LEA', '161')!.set_code).toBe('MH2');
  });

  it('resolveDefaultCutKey falls back to first cut option', () => {
    const deck = { deck_snapshot: { cards: [] }, suggestions: [] };
    const suggestion = { action: 'replace', replaces: [{ name: 'Fallback' }] };
    const key = resolveDefaultCutKey(deck, suggestion, [
      { name: 'Fallback', set_code: 'MSH', collector_number: '1' },
    ]);
    expect(key).toContain('Fallback');
    expect(defaultOutKeyForSuggestion(deck, { replaces: [{ name: 'X' }] }).defaultOutKey).toBe('X||');
  });

  it('formats printing and cut option labels', () => {
    const print = {
      id: 'p1',
      name: 'Bolt',
      set: 'MH2',
      set_name: 'Modern Horizons 2',
      collector_number: '1',
      prices: { usd: '1.50' },
    };
    expect(printingLabel(print)).toContain('$1.50');
    expect(printOptionLines(print).length).toBeGreaterThan(0);
    expect(optionLabel({ name: 'Bolt', set_code: 'MH2', collector_number: '1' })).toContain('MH2');
    expect(cutOptionLines({ name: 'Bolt', set_code: 'mh2', collector_number: '1' })).toEqual(['Bolt', 'MH2 #1']);
    expect(cutOptionImageSrc({ name: 'Bolt', set_code: 'MH2', collector_number: '1' }, { deck_snapshot: { cards: [] } })).toContain(
      'scryfall',
    );
  });

  it('resolveDefaultCutKey handles missing cuts and fallback options', () => {
    const deck = {
      deck_snapshot: { cards: [{ name: 'Old', set_code: 'CMM', collector_number: '9' }] },
      suggestions: [],
    };
    const suggestion = { action: 'replace', replaces: [{ name: 'Old' }] };
    const key = resolveDefaultCutKey(deck, suggestion, [{ name: 'Fallback', set_code: 'MSH', collector_number: '1' }]);
    expect(key).toContain('Old');
    expect(resolveDefaultCutKey(deck, { action: 'replace', replaces: [] }, [])).toBe('');
    expect(defaultOutKeyForSuggestion(deck, { replaces: [] }).defaultOutKey).toBe('');
  });
});

describe('deck-review decisions', () => {
  it('decisionStatusClass and decisionStatusText cover all statuses', () => {
    expect(decisionStatusClass('accepted')).toContain('accepted');
    expect(decisionStatusClass('rejected')).toContain('rejected');
    expect(decisionStatusClass('skipped')).toContain('skipped');
    expect(decisionStatusClass('pending')).toBe('');
    expect(decisionStatusText('rejected')).toBe('Rejected');
    expect(decisionStatusText('unknown')).toBe('');
  });

  it('decisionStatusLabel and decisionRecapInOut cover accepted and pending paths', () => {
    expect(decisionStatusLabel('accepted')).toContain('Accepted');
    expect(decisionStatusLabel('pending')).toContain('Pending');
    const suggestion = {
      card: { name: 'Bolt', set_code: 'MH2' },
      replaces: [{ name: 'Shock' }],
    } as never;
    expect(decisionRecapInOut(suggestion, null)).toEqual({ inName: 'Bolt', inSet: 'MH2', outName: 'Shock' });
    expect(
      decisionRecapInOut(suggestion, {
        status: 'accepted',
        accepted: { card_in: { name: 'Lightning Bolt', set_code: 'LEA' }, card_out: { name: 'Shock' } },
      }),
    ).toEqual({ inName: 'Lightning Bolt', inSet: 'LEA', outName: 'Shock' });
  });

  it('acceptedForDeck collects accepted swaps only', () => {
    const deck = {
      deck_id: 'd1',
      suggestions: [{ suggestion_id: 's1' }, { suggestion_id: 's2' }],
    };
    const progress = {
      decisions: {
        s1: { status: 'accepted', accepted: { card_in: { name: 'In' }, card_out: { name: 'Out' } } },
        s2: { status: 'skipped' },
      },
      currentDeckId: null,
      currentSuggestionIndex: {},
    };
    expect(acceptedForDeck(deck, progress)).toHaveLength(1);
  });

  it('buildAcceptedSwap rejects missing cut when suggestion requires one', () => {
    const deck = { deck_id: 'd1', deck_snapshot: { cards: [] } };
    const suggestion = { suggestion_id: 's1', action: 'replace', card: { name: 'New' }, replaces: [{ name: 'Old' }] };
    const missing = buildAcceptedSwap(deck, suggestion as never, {
      printId: 'p1',
      finish: 'nonfoil',
      prints: [{ id: 'p1', name: 'New' }],
      cutMeta: { name: '', quantity: 1, set_code: null, collector_number: null },
    });
    expect('error' in missing).toBe(true);
  });

  it('maps decision status helpers', () => {
    expect(decisionStatusClass('accepted')).toContain('accepted');
    expect(decisionStatusText('skipped')).toBe('Skipped');
    expect(getDecision(
      { decisions: { s1: { status: 'accepted' } }, currentDeckId: null, currentSuggestionIndex: {} },
      's1',
    )!.status).toBe('accepted');
  });

  it('buildAcceptedSwap validates missing cuts and enriches from snapshot', () => {
    const deck = {
      deck_id: 'd1',
      archidekt_url: 'https://archidekt.com/decks/123/test',
      deck_snapshot: { cards: [{ name: 'Old', set_code: 'CMM', collector_number: '9' }] },
    };
    const suggestion = {
      suggestion_id: 's1',
      action: 'replace',
      card: { name: 'New', set_code: 'MSH', collector_number: '1' },
      replaces: [],
    };
    const missingCut = buildAcceptedSwap(deck, suggestion, {
      printId: 'p1',
      finish: 'nonfoil',
      prints: [],
      cutMeta: { name: '', quantity: 1, set_code: null, collector_number: null },
    });
    expect('error' in missingCut && missingCut.error).toBeTruthy();
    const accepted = buildAcceptedSwap(deck, suggestion, {
      printId: 'p1',
      finish: 'nonfoil',
      prints: [{ id: 'p1', name: 'New', set: 'MSH', collector_number: '1' }],
      cutMeta: { name: 'Old', quantity: 1, set_code: null, collector_number: null },
    });
    expect((accepted as { card_out: { set_code: string } }).card_out.set_code).toBe('CMM');
  });

  it('allAcceptedByDeck groups accepted swaps by deck id', () => {
    const decks = [{
      deck_id: 'd1',
      suggestions: [{ suggestion_id: 's1' }],
    }];
    const progress = {
      decisions: { s1: { status: 'accepted', accepted: { card_in: { name: 'In' }, card_out: { name: 'Out' } } } },
      currentDeckId: null,
      currentSuggestionIndex: {},
    };
    expect(allAcceptedByDeck(decks, progress).d1).toHaveLength(1);
  });
});

describe('deck-review pickers', () => {
  it('cutMetaFromKey parses raw keys when option is missing', () => {
    expect(cutMetaFromKey('Bolt|MH2|1', [])).toEqual({
      name: 'Bolt',
      quantity: 1,
      set_code: 'MH2',
      collector_number: '1',
    });
    expect(cutMetaFromKey('', [])).toEqual({
      name: '',
      quantity: 1,
      set_code: null,
      collector_number: null,
    });
  });

  it('buildPrintPickerItems falls back to suggestion scryfall id', () => {
    const items = buildPrintPickerItems([], {
      card: { name: 'Bolt', scryfall_id: 'abc', set_code: 'MH2', collector_number: '1' },
    } as never);
    expect(items[0].value).toBe('abc');
  });

  it('buildCutPickerItems prepends current key when absent from options', () => {
    const items = buildCutPickerItems(
      [{ name: 'Sol Ring', set_code: 'CMM', collector_number: '1' }],
      { deck_snapshot: { cards: [] } } as never,
      { action: 'replace', replaces: [{ name: 'Old' }] } as never,
      'Old|LEA|1',
      { name: 'Old', quantity: 1, set_code: 'LEA', collector_number: '1' },
    );
    expect(items[0].value).toBe('Old|LEA|1');
  });

  it('summary labels cover print match and cut option lookup', () => {
    expect(
      printSummaryLabel('p1', [{ id: 'p1', name: 'Bolt', set: 'MH2', collector_number: '1' }], { card: { name: 'Bolt' } } as never, 'nonfoil'),
    ).toContain('MH2');
    expect(
      printSummaryLabel('abc', [], { card: { name: 'Bolt', scryfall_id: 'abc', set_code: 'MH2', collector_number: '1' } } as never, 'nonfoil'),
    ).toContain('MH2');
    expect(
      printSummaryLabel('missing', [], { card: { name: 'Bolt' } } as never, 'nonfoil'),
    ).toBe('Printing selected');
    expect(cutSummaryLabel({ name: 'Bolt', quantity: 1, set_code: 'MH2', collector_number: '1' }, [])).toContain('MH2 #1');
  });

  it('buildCutPickerItems prepends manual cut row when suggestion lacks cut', () => {
    const items = buildCutPickerItems(
      [{ name: 'Sol Ring', set_code: 'CMM', collector_number: '1' }],
      { deck_snapshot: { cards: [] } } as never,
      { action: 'replace', replaces: [] } as never,
      '',
      { name: '', quantity: 1, set_code: null, collector_number: null },
    );
    expect(items[0].lines[0]).toBe('No cut suggested');
  });

  it('summary labels cover foil and fallback paths', () => {
    expect(printSummaryLabel('', [], { card: { name: 'Bolt' } } as never, 'nonfoil')).toBe('No printing selected');
    expect(
      printSummaryLabel('abc', [], { card: { name: 'Bolt', scryfall_id: 'abc', set_code: 'MH2', collector_number: '1' } } as never, 'foil'),
    ).toContain('Foil');
    expect(cutSummaryLabel({ name: 'Sol Ring', quantity: 1, set_code: 'CMM', collector_number: '1' }, [
      { name: 'Sol Ring', set_code: 'CMM', collector_number: '1' },
    ])).toContain('CMM');
    expect(cutSummaryLabel({ name: '', quantity: 1, set_code: null, collector_number: null }, [])).toBe('No cut selected');
  });

  it('openPrintPicker and openCutPicker delegate to HubCardPicker when present', () => {
    const open = vi.fn();
    (window as Window & { HubCardPicker?: unknown }).HubCardPicker = {
      open,
      resolveFinish: () => 'foil',
    };
    openPrintPicker({ card: { name: 'Bolt' } } as never, [{ id: 'p1', name: 'Bolt', set: 'MH2', collector_number: '1' }], 'p1', true, () => {});
    expect(open).toHaveBeenCalled();
    openCutPicker(
      { deck_snapshot: { cards: [] } } as never,
      { action: 'replace', replaces: [] } as never,
      [{ name: 'Sol Ring', set_code: 'CMM', collector_number: '1' }],
      'Sol Ring|CMM|1',
      { name: 'Sol Ring', quantity: 1, set_code: 'CMM', collector_number: '1' },
      () => {},
    );
    expect(open).toHaveBeenCalledTimes(2);
    delete (window as Window & { HubCardPicker?: unknown }).HubCardPicker;
  });

  it('openPrintPicker and openCutPicker no-op without HubCardPicker', () => {
    expect(() =>
      openPrintPicker({ card: { name: 'Bolt' } } as never, [], '', false, () => {}),
    ).not.toThrow();
    expect(() =>
      openCutPicker({ deck_snapshot: { cards: [] } } as never, { replaces: [] } as never, [], '', { name: '', quantity: 1, set_code: null, collector_number: null }, () => {}),
    ).not.toThrow();
  });
});

describe('deck-review profiles', () => {
  it('addRuntimePreference deduplicates card names', () => {
    const next = addPref({}, 'd1', 'blocked_cards', 'Sol Ring');
    const again = addPref(next, 'd1', 'blocked_cards', 'Sol Ring');
    expect(again.d1.blocked_cards).toEqual(['Sol Ring']);
    expect(addPref({}, 'd1', 'blocked_cards', '')).toEqual({});
  });

  it('isSuggestionFiltered blocks protected cuts', () => {
    expect(
      isSuggestionFiltered({ card: { name: 'New' }, replaces: [{ name: 'Sacred Foundry' }] }, {
        blocked_cards: [],
        protected_cards: ['Sacred Foundry'],
      }),
    ).toBe(true);
  });

  it('selectedInCardName prefers print name', () => {
    expect(selectedInCardName({ card: { name: 'Bolt' } } as never, 'p1', [{ id: 'p1', name: 'Lightning Bolt' }])).toBe(
      'Lightning Bolt',
    );
  });

  it('prefCountsLabel summarizes merged preferences', () => {
    const deck = { deck_id: 'd1', profile_preferences: { blocked_cards: ['A'], protected_cards: ['B'] } };
    expect(prefCountsLabel(deck, {})).toBe('1 blocked · 1 protected');
    expect(prefCountsLabel(null, {})).toBe('');
  });
});

describe('deck-review review helpers', () => {
  const fixture = loadSuggestionFixture(FIXTURE_NAME);
  const baird = deckFromFixture(fixture, 'baird');

  it('applyLoadedSuggestions restores deck and progress state', () => {
    const fixture = loadSuggestionFixture(FIXTURE_NAME);
    const state = createInitialReviewState();
    const next = applyLoadedSuggestions(state, fixture, {
      decisions: {},
      currentDeckId: 'baird',
      currentSuggestionIndex: { baird: 2 },
    });
    expect(next.fileId).toBe('MSH-2026-06-21');
    expect(next.activeDeckId).toBe('baird');
    expect(next.suggestionIndex).toBe(2);
  });

  it('showDownloadJson and refreshAllDecksLabel vary by transfer source', () => {
    expect(showDownloadJson('deck-suggest')).toBe(true);
    expect(showDownloadJson('upload')).toBe(false);
    expect(refreshAllDecksLabel('deck-suggest')).toContain('optional');
    expect(refreshAllDecksLabel('upload')).toBe('Refresh all decks');
  });

  it('recordDecision without advance leaves suggestion index unchanged', () => {
    const state = {
      ...createInitialReviewState(),
      fileId: 'MSH-2026-06-21',
      activeDeckId: 'baird',
      suggestionIndex: 3,
      progress: { decisions: {}, currentDeckId: null, currentSuggestionIndex: {} },
    };
    const next = recordDecision(state, 's-new', { status: 'rejected' }, false);
    expect(next.suggestionIndex).toBe(3);
  });

  it('selectDeck without fileId skips progress persistence', () => {
    const state = { ...createInitialReviewState(), activeDeckId: 'a' };
    const next = selectDeck(state, 'b');
    expect(next.activeDeckId).toBe('b');
    expect(next.suggestionIndex).toBe(0);
  });

  it('getDeckById and deckSuggestionCount handle missing data', () => {
    expect(getDeckById(null, 'x')).toBe(null);
    expect(deckSuggestionCount({ suggestions: [{ suggestion_id: 's1' }] })).toBe(1);
  });

  it('deckProgressCounts and pendingSuggestions respect filters and progress', () => {
    const progress = {
      decisions: { 'baird-001': { status: 'accepted' } },
      currentDeckId: null,
      currentSuggestionIndex: {},
    };
    const counts = deckProgressCounts(baird, progress);
    expect(counts.total).toBeGreaterThan(0);
    const prefs = getDeckPreferences(baird, {});
    const visible = allVisibleSuggestions(baird, {});
    expect(visible.length).toBeLessThanOrEqual(baird.suggestions!.length);
    const pending = pendingSuggestions(baird, progress, {});
    expect(pending.every((s) => !progress.decisions[String(s.suggestion_id)] || progress.decisions[String(s.suggestion_id)].status === 'skipped')).toBe(true);
    expect(isSuggestionFiltered({ card: { name: 'Blocked' }, replaces: [] }, { blocked_cards: ['Blocked'], protected_cards: [] })).toBe(true);
  });

  it('currentSuggestion clamps index to pending list', () => {
    const progress = { decisions: {}, currentDeckId: null, currentSuggestionIndex: {} };
    const suggestion = currentSuggestion(baird, progress, {}, 999);
    expect(suggestion).toBeTruthy();
    expect(currentSuggestion({ suggestions: [] }, progress, {}, 0)).toBe(null);
  });

  it('sortDecksByName orders decks alphabetically', () => {
    const sorted = sortDecksByName([
      { deck_id: 'b', deck_name: 'Zebra' },
      { deck_id: 'a', deck_name: 'Alpha' },
    ]);
    expect(sorted[0].deck_name).toBe('Alpha');
  });

  it('handoffSnapshotDate picks latest fetched_at', () => {
    expect(
      handoffSnapshotDate({
        decks: [
          { deck_snapshot: { fetched_at: '2026-01-01' } },
          { deck_snapshot: { fetched_at: '2026-06-01' } },
        ],
      } as never),
    ).toBe('2026-06-01');
    expect(handoffSnapshotDate({ decks: [] } as never)).toBe(null);
  });

  it('handoffStatusMessage covers deck-suggest transfer branches', () => {
    expect(handoffStatusMessage({ decks: [{ deck_snapshot: null }] } as never, 'upload')).toBe(null);
    const readyData = {
      decks: [{
        deck_snapshot: { cards: [{ name: 'Sol Ring' }] },
        suggestions: [{ suggestion_id: 's1' }],
      }],
    };
    expect(handoffStatusMessage(readyData as never, 'deck-suggest')).toContain('Ready to review');
    expect(
      handoffStatusMessage({ decks: [{ deck_snapshot: null, suggestions: [{ suggestion_id: 's1' }] }] } as never, 'deck-suggest'),
    ).toContain('missing snapshots');
  });

  it('recordDecision and selectDeck persist progress when fileId is set', () => {
    const state = {
      ...createInitialReviewState(),
      fileId: 'MSH-2026-06-21',
      activeDeckId: 'baird',
      suggestionIndex: 0,
      progress: { decisions: {}, currentDeckId: null, currentSuggestionIndex: {} },
    };
    const next = recordDecision(state, 's-new', { status: 'accepted' }, true);
    expect(next.suggestionIndex).toBe(1);
    const selected = selectDeck(state, 'other-deck');
    expect(selected.activeDeckId).toBe('other-deck');
    const unchanged = recordDecision({ ...state, fileId: null }, 's-new', { status: 'accepted' }, true);
    expect(unchanged.fileId).toBe(null);
    expect(unchanged.suggestionIndex).toBe(0);
  });

  it('refreshAllDecksTitle varies by transfer source and bridge availability', () => {
    expect(refreshAllDecksTitle(true, 'deck-suggest')).toContain('Deck Suggest');
    expect(refreshAllDecksTitle(false, 'upload')).toContain('Bridge');
  });
});

describe('printingToCardIn', () => {
  it('maps fallback fields when print lacks data', () => {
    const cardIn = printingToCardIn(
      { id: 'p1', name: 'Bolt', set: 'mh2', collector_number: '1' },
      { name: 'Bolt', set_code: 'MH2', collector_number: '1', scryfall_uri: 'https://example.com' },
      'etched',
    );
    expect(cardIn.finish).toBe('etched');
    expect(cardIn.set_code).toBe('MH2');
  });
});

describe('deckCutOptions deduplication', () => {
  it('includes replace targets from suggestions even when absent from snapshot cuts', () => {
    const fixture = loadSuggestionFixture(FIXTURE_NAME);
    const borbs = deckFromFixture(fixture, 'big-ol-borbs-landscaping-irl');
    const names = deckCutOptions(borbs).map((o) => o.name);
    expect(names).toContain('Conduit of Worlds');
  });
});
