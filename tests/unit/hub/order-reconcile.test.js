import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadHubModule, resetHubModules } from '../helpers/hubHarness.js';

let OR;

const FILES = [
   'shared/hub-utils.js',
   'shared/scryfall-cache.js',
   'shared/swap-queue.js',
   'apps/deck-review/archidekt-export.js',
   'apps/order-reconcile/email-parse.js',
   'apps/order-reconcile/order-reconcile-export.js',
   'apps/order-reconcile/order-reconcile.js',
   'apps/order-reconcile/or-data.js',
   'apps/order-reconcile/or-summary.js',
   'apps/order-reconcile/or-assign.js',
   'apps/order-reconcile/or-reconcile.js',
   'apps/order-reconcile/or-input.js',
];

function commanderDeck(id, name) {
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

beforeEach(() => {
   resetHubModules();
   window.HubStorage = {
      saveOrderReconcileProgress() {},
      loadOrderReconcileProgress() { return { decisions: {} }; },
      saveOrderReconcileSettings() {},
      loadOrderReconcileSettings() { return {}; },
   };
   OR = loadHubModule(FILES, 'OrderReconcile');
});

afterEach(() => {
   resetHubModules();
   delete window.HubStorage;
});

describe('OrderReconcile.expandToCopies', () => {
   it('expands acquired quantities into individual copies', () => {
      const copies = OR.expandToCopies([{ id: 'acq-0', name: 'Sol Ring', quantity: 2, set_code: 'cmm', collector_number: '1' }]);
      expect(copies).toHaveLength(2);
      expect(copies[0].copy_id).toBe('acq-0:0');
      expect(copies[1].copy_id).toBe('acq-0:1');
      expect(copies[0].card_name).toBe('Sol Ring');
   });
});

describe('OrderReconcile.findCandidatesForName', () => {
   it('matches a card to a deck swap-in slot', () => {
      OR.state.decks = [commanderDeck('d1', 'Test Deck')];
      const candidates = OR.findCandidatesForName('New Card');
      expect(candidates).toHaveLength(1);
      expect(candidates[0].deck_id).toBe('d1');
      expect(candidates[0].is_cube).toBe(false);
      expect(candidates[0].paired_out.name).toBe('Cut Card');
   });

   it('returns nothing for a card not in any swap queue', () => {
      OR.state.decks = [commanderDeck('d1', 'Test Deck')];
      expect(OR.findCandidatesForName('Unrelated')).toHaveLength(0);
   });
});

describe('OrderReconcile.findMaybeboardCandidatesForName', () => {
   it('finds maybeboard entries in non-cube decks as a fallback', () => {
      OR.state.decks = [commanderDeck('d1', 'Test Deck')];
      const mb = OR.findMaybeboardCandidatesForName('Stash Me');
      expect(mb).toHaveLength(1);
      expect(mb[0].is_maybeboard).toBe(true);
      expect(mb[0].deck_id).toBe('d1');
      expect(mb[0].maybeboard_entry.name).toBe('Stash Me');
   });

   it('ignores cube decks', () => {
      const cube = commanderDeck('c1', 'Vintage Cube');
      OR.state.decks = [cube];
      expect(OR.findMaybeboardCandidatesForName('Stash Me')).toHaveLength(0);
   });
});

describe('OrderReconcile.buildAssignmentPlan maybeboard fallback', () => {
   it('routes a maybeboard-only card to needs-review with reason maybeboard', async () => {
      OR.state.decks = [commanderDeck('d1', 'Test Deck')];
      OR.state.acquiredCards = [{ id: 'acq-0', name: 'Stash Me', quantity: 1 }];
      OR.state.progress = { decisions: {} };
      OR.state.sessionId = 'test';
      await OR.buildAssignmentPlan();
      expect(OR.state.assignments).toHaveLength(0);
      expect(OR.state.needsReview).toHaveLength(1);
      expect(OR.state.needsReview[0].reason).toBe('maybeboard');
      expect(OR.state.needsReview[0].candidates[0].deck_id).toBe('d1');
   });

   it('auto-assigns a swap-queue match', async () => {
      OR.state.decks = [commanderDeck('d1', 'Test Deck')];
      OR.state.acquiredCards = [{ id: 'acq-0', name: 'New Card', quantity: 1 }];
      OR.state.progress = { decisions: {} };
      OR.state.sessionId = 'test';
      await OR.buildAssignmentPlan();
      expect(OR.state.assignments).toHaveLength(1);
      expect(OR.state.assignments[0].deck_id).toBe('d1');
      expect(OR.state.needsReview).toHaveLength(0);
   });
});

describe('OrderReconcile select builders', () => {
   it('deckOptionsHtml groups cube and commander decks', () => {
      OR.state.decks = [commanderDeck('d1', 'Atraxa'), commanderDeck('c1', 'Legacy Cube')];
      const html = OR.deckOptionsHtml('', true, {});
      expect(html).toContain('— leave out (buy/trade only) —');
      expect(html).toContain('<optgroup label="Cube">');
      expect(html).toContain('<optgroup label="Commander">');
      expect(html).toContain('Legacy Cube');
   });

   it('maybeboardDeckOptionsHtml elevates suggested decks under a maybeboard group', () => {
      OR.state.decks = [commanderDeck('d1', 'Atraxa')];
      const nr = { assigned_deck_id: '', candidates: [{ deck_id: 'd1', deck_name: 'Atraxa' }] };
      const html = OR.maybeboardDeckOptionsHtml(nr, {});
      expect(html).toContain('<optgroup label="Found in maybeboard">');
      expect(html).toContain('Atraxa');
   });

   it('candidateOptionsHtml splits cube and commander candidates', () => {
      const html = OR.candidateOptionsHtml([
         { deck_id: 'd1', deck_name: 'Atraxa', is_cube: false },
         { deck_id: 'c1', deck_name: 'Cube One', is_cube: true },
      ], 'd1', {});
      expect(html).toContain('<optgroup label="Cube">');
      expect(html).toContain('<optgroup label="Commander">');
      expect(html).toContain('selected');
   });
});

describe('OrderReconcile.deckCutOptions', () => {
   it('excludes swap-queue and protected categories', () => {
      const deck = commanderDeck('d1', 'Test Deck');
      const opts = OR.deckCutOptions(deck, null, false);
      const names = opts.map((o) => o.name);
      expect(names).toContain('Sol Ring');
      expect(names).not.toContain('New Card');
      expect(names).not.toContain('Cut Card');
      expect(names).not.toContain('Stash Me');
   });
});

describe('OrderReconcile label/value helpers', () => {
   it('formatCardLabel includes set, collector, and foil', () => {
      expect(OR.formatCardLabel({ name: 'Sol Ring', set_code: 'cmm', collector_number: '1' }))
         .toBe('Sol Ring (CMM #1)');
      expect(OR.formatCardLabel({ name: 'Sol Ring', set_code: 'cmm', collector_number: '1', finish: 'foil' }))
         .toBe('Sol Ring (CMM #1) · Foil');
      expect(OR.formatCardLabel(null)).toBe('—');
   });

   it('cutValueFromOpt and readCutValue round-trip', () => {
      const value = OR.cutValueFromOpt({ name: 'Sol Ring', set_code: 'cmm', collector_number: '1' });
      expect(OR.readCutValue(value)).toEqual({ name: 'Sol Ring', set_code: 'cmm', collector_number: '1', quantity: 1 });
      expect(OR.readCutValue('not json')).toBe(null);
   });

   it('printingValueFromParts defaults finish to nonfoil and round-trips', () => {
      const value = OR.printingValueFromParts({ name: 'Sol Ring', set_code: 'cmm', collector_number: '1' });
      expect(OR.readPrintingValue(value)).toEqual({ name: 'Sol Ring', set_code: 'cmm', collector_number: '1', finish: 'nonfoil' });
   });
});

describe('OrderReconcile.sortDecksByName', () => {
   it('orders cube decks before commander decks, then alphabetically', () => {
      const decks = [
         commanderDeck('d1', 'Zedruu'),
         commanderDeck('d2', 'Atraxa'),
         commanderDeck('c1', 'Powered Cube'),
      ];
      const sorted = OR.sortDecksByName(decks).map((d) => d.deck_name);
      expect(sorted).toEqual(['Powered Cube', 'Atraxa', 'Zedruu']);
   });
});
