import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildAssignmentIndex,
  buildAssignmentPlan,
  deckCutOptions,
  expandToCopies,
  findCandidatesForName,
  findMaybeboardCandidatesForName,
  formatCardLabel,
  cutValueFromOpt,
  readCutValue,
  sortDecksByName,
} from '../../../packages/web/src/order-reconcile/index.ts';
import {
  candidateOptionsHtml,
  deckOptionsHtml,
  maybeboardDeckOptionsHtml,
} from '../../../packages/web/src/order-reconcile/select-options.ts';
import { printingValueFromParts, readPrintingValue } from '../../../packages/web/src/order-reconcile/data.ts';
import type { OrderReconcileDeck, OrderReconcileState } from '../../../packages/web/src/order-reconcile/types.ts';
import { DEFAULT_ORDER_RECONCILE_SETTINGS } from '@rayenz-hub/shared';

function commanderDeck(id: string, name: string): OrderReconcileDeck {
  return {
    deck_id: id,
    deck_name: name,
    deck_snapshot: {
      cards: [
        { name: 'New Card', primary_category: 'New Set In', quantity: 1, set_code: 'nin', collector_number: '1' },
        { name: 'Cut Card', primary_category: 'New Set Out', quantity: 1, set_code: 'nout', collector_number: '1' },
        { name: 'Sol Ring', primary_category: 'Ramp', quantity: 1, set_code: 'cmm', collector_number: '1' },
        { name: 'Stash Me', primary_category: 'Maybeboard', quantity: 1, set_code: 'mb', collector_number: '9' },
      ],
    },
  };
}

function baseState(overrides: Partial<OrderReconcileState> = {}): OrderReconcileState {
  return {
    phase: 'input',
    sessionId: 'test',
    settings: { ...DEFAULT_ORDER_RECONCILE_SETTINGS },
    acquiredCards: [],
    copies: [],
    assignments: [],
    needsReview: [],
    decks: [],
    stagingDeck: null,
    reconcileItems: [],
    completedDecks: {},
    activeDeckId: null,
    assignmentIndex: null,
    inputMode: 'list',
    isProxyOrder: false,
    colorIdentityCache: {},
    progress: { decisions: {} },
    statusMessage: '',
    ...overrides,
  };
}

let state: OrderReconcileState;

beforeEach(() => {
  state = baseState();
});

afterEach(() => {
  state = baseState();
});

describe('expandToCopies', () => {
  it('expands acquired quantities into individual copies', () => {
    const copies = expandToCopies([
      { id: 'acq-0', name: 'Sol Ring', quantity: 2, set_code: 'cmm', collector_number: '1' },
    ]);
    expect(copies).toHaveLength(2);
    expect(copies[0].copy_id).toBe('acq-0:0');
    expect(copies[1].copy_id).toBe('acq-0:1');
    expect(copies[0].card_name).toBe('Sol Ring');
  });
});

describe('findCandidatesForName', () => {
  it('matches a card to a deck swap-in slot', () => {
    state.decks = [commanderDeck('d1', 'Test Deck')];
    const candidates = findCandidatesForName(state, 'New Card');
    expect(candidates).toHaveLength(1);
    expect(candidates[0].deck_id).toBe('d1');
    expect(candidates[0].is_cube).toBe(false);
    expect(candidates[0].paired_out?.name).toBe('Cut Card');
  });

  it('returns nothing for a card not in any swap queue', () => {
    state.decks = [commanderDeck('d1', 'Test Deck')];
    expect(findCandidatesForName(state, 'Unrelated')).toHaveLength(0);
  });
});

describe('buildAssignmentIndex', () => {
  it('precomputes swap and maybeboard candidate maps from deck snapshots', () => {
    state.decks = [commanderDeck('d1', 'Test Deck')];
    const index = buildAssignmentIndex(state.decks);
    expect(index.swapByName['new card']).toHaveLength(1);
    expect(index.swapByName['new card'][0].deck_id).toBe('d1');
    expect(index.maybeboardByName['stash me']).toHaveLength(1);
    expect(index.maybeboardByName['stash me'][0].is_maybeboard).toBe(true);
  });

  it('findCandidatesForName uses the precomputed index', () => {
    state.decks = [commanderDeck('d1', 'Test Deck')];
    state.assignmentIndex = buildAssignmentIndex(state.decks);
    const candidates = findCandidatesForName(state, 'New Card');
    expect(candidates).toHaveLength(1);
    expect(candidates[0].paired_out?.name).toBe('Cut Card');
  });

  it('indexes double-faced card names by each face', () => {
    const deck: OrderReconcileDeck = {
      deck_id: 'd1',
      deck_name: 'DFC Deck',
      deck_snapshot: {
        cards: [
          {
            name: 'Delver of Secrets // Insectile Aberration',
            primary_category: 'New Set In',
            set_code: 'isd',
            collector_number: '51',
          },
          { name: 'Cut Card', primary_category: 'New Set Out', set_code: 'x', collector_number: '1' },
        ],
      },
    };
    state.decks = [deck];
    state.assignmentIndex = buildAssignmentIndex(state.decks);
    expect(findCandidatesForName(state, 'Delver of Secrets')).toHaveLength(1);
    expect(findCandidatesForName(state, 'Insectile Aberration')).toHaveLength(1);
  });
});

describe('findMaybeboardCandidatesForName', () => {
  it('finds maybeboard entries in non-cube decks as a fallback', () => {
    state.decks = [commanderDeck('d1', 'Test Deck')];
    const mb = findMaybeboardCandidatesForName(state, 'Stash Me');
    expect(mb).toHaveLength(1);
    expect(mb[0].is_maybeboard).toBe(true);
    expect(mb[0].deck_id).toBe('d1');
    expect(mb[0].maybeboard_entry?.name).toBe('Stash Me');
  });

  it('ignores cube decks', () => {
    const cube = commanderDeck('c1', 'Vintage Cube');
    state.decks = [cube];
    expect(findMaybeboardCandidatesForName(state, 'Stash Me')).toHaveLength(0);
  });
});

describe('buildAssignmentPlan maybeboard fallback', () => {
  it('routes a maybeboard-only card to needs-review with reason maybeboard', async () => {
    state.decks = [commanderDeck('d1', 'Test Deck')];
    state.acquiredCards = [{ id: 'acq-0', name: 'Stash Me', quantity: 1 }];
    const plan = await buildAssignmentPlan(state);
    expect(plan.assignments).toHaveLength(0);
    expect(plan.needsReview).toHaveLength(1);
    expect(plan.needsReview![0].reason).toBe('maybeboard');
    expect(plan.needsReview![0].candidates[0].deck_id).toBe('d1');
  });

  it('auto-assigns a swap-queue match', async () => {
    state.decks = [commanderDeck('d1', 'Test Deck')];
    state.acquiredCards = [{ id: 'acq-0', name: 'New Card', quantity: 1 }];
    const plan = await buildAssignmentPlan(state);
    expect(plan.assignments).toHaveLength(1);
    expect(plan.assignments![0].deck_id).toBe('d1');
    expect(plan.needsReview).toHaveLength(0);
  });
});

describe('select builders', () => {
  it('deckOptionsHtml groups cube and commander decks', () => {
    state.decks = [commanderDeck('d1', 'Atraxa'), commanderDeck('c1', 'Legacy Cube')];
    const html = deckOptionsHtml(state.decks, '', true, {});
    expect(html).toContain('— leave out (buy/trade only) —');
    expect(html).toContain('<optgroup label="Cube">');
    expect(html).toContain('<optgroup label="Commander">');
    expect(html).toContain('Legacy Cube');
  });

  it('maybeboardDeckOptionsHtml elevates suggested decks under a maybeboard group', () => {
    state.decks = [commanderDeck('d1', 'Atraxa')];
    const nr = { assigned_deck_id: '', candidates: [{ deck_id: 'd1', deck_name: 'Atraxa' }] };
    const html = maybeboardDeckOptionsHtml(state.decks, nr as never, {});
    expect(html).toContain('<optgroup label="Found in maybeboard">');
    expect(html).toContain('Atraxa');
  });

  it('candidateOptionsHtml splits cube and commander candidates', () => {
    const html = candidateOptionsHtml(
      [
        { deck_id: 'd1', deck_name: 'Atraxa', is_cube: false } as never,
        { deck_id: 'c1', deck_name: 'Cube One', is_cube: true } as never,
      ],
      'd1',
      {},
    );
    expect(html).toContain('<optgroup label="Cube">');
    expect(html).toContain('<optgroup label="Commander">');
    expect(html).toContain('selected');
  });
});

describe('deckCutOptions', () => {
  it('excludes swap-queue and protected categories', () => {
    const deck = commanderDeck('d1', 'Test Deck');
    const opts = deckCutOptions(deck, null, false);
    const names = opts.map((o) => o.name);
    expect(names).toContain('Sol Ring');
    expect(names).not.toContain('New Card');
    expect(names).not.toContain('Cut Card');
    expect(names).not.toContain('Stash Me');
  });
});

describe('label/value helpers', () => {
  it('formatCardLabel includes set, collector, and foil', () => {
    expect(formatCardLabel({ name: 'Sol Ring', set_code: 'cmm', collector_number: '1' })).toBe('Sol Ring (CMM #1)');
    expect(formatCardLabel({ name: 'Sol Ring', set_code: 'cmm', collector_number: '1', finish: 'foil' })).toBe(
      'Sol Ring (CMM #1) · Foil',
    );
    expect(formatCardLabel(null)).toBe('—');
  });

  it('cutValueFromOpt and readCutValue round-trip', () => {
    const value = cutValueFromOpt({ name: 'Sol Ring', set_code: 'cmm', collector_number: '1' });
    expect(readCutValue(value)).toEqual({ name: 'Sol Ring', set_code: 'cmm', collector_number: '1', quantity: 1 });
    expect(readCutValue('not json')).toBe(null);
  });

  it('printingValueFromParts defaults finish to nonfoil and round-trips', () => {
    const value = printingValueFromParts({ name: 'Sol Ring', set_code: 'cmm', collector_number: '1' });
    expect(readPrintingValue(value)).toEqual({
      name: 'Sol Ring',
      set_code: 'cmm',
      collector_number: '1',
      finish: 'nonfoil',
    });
  });
});

describe('sortDecksByName', () => {
  it('orders cube decks before commander decks, then alphabetically', () => {
    const decks = [commanderDeck('d1', 'Zedruu'), commanderDeck('d2', 'Atraxa'), commanderDeck('c1', 'Powered Cube')];
    const sorted = sortDecksByName(decks).map((d) => d.deck_name);
    expect(sorted).toEqual(['Powered Cube', 'Atraxa', 'Zedruu']);
  });
});
