import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadHubModule, resetHubModules } from '../helpers/hubHarness.js';

let CutCandidates;

function commanderSnapshot() {
   return {
      cards: [
         { name: 'New Card', primary_category: 'New Set In', quantity: 1, set_code: 'nin', collector_number: '1' },
         { name: 'Cut Card', primary_category: 'New Set Out', quantity: 1, set_code: 'nout', collector_number: '1' },
         { name: 'Sol Ring', primary_category: 'Ramp', quantity: 1, set_code: 'cmm', collector_number: '1' },
         { name: 'Stash Me', primary_category: 'Maybeboard', quantity: 1, set_code: 'mb', collector_number: '9' },
         { name: 'Atraxa', primary_category: 'Commander', quantity: 1, set_code: 'c16', collector_number: '1' },
      ],
   };
}

beforeEach(() => {
   resetHubModules();
   CutCandidates = loadHubModule([
      'shared/hub-utils.js',
      'shared/swap-queue.js',
      'shared/cut-candidates.js',
   ], 'CutCandidates');
});

afterEach(() => {
   resetHubModules();
});

describe('CutCandidates.buildCutCandidates', () => {
   it('excludes swap-queue and commander categories from main deck scan', () => {
      const names = CutCandidates.buildCutCandidates(commanderSnapshot()).map((o) => o.name);
      expect(names).toContain('Sol Ring');
      expect(names).not.toContain('New Card');
      expect(names).not.toContain('Cut Card');
      expect(names).not.toContain('Atraxa');
   });

   it('excludeMaybeboard removes maybeboard cards', () => {
      const names = CutCandidates.buildCutCandidates(commanderSnapshot(), {
         excludeMaybeboard: true,
      }).map((o) => o.name);
      expect(names).toContain('Sol Ring');
      expect(names).not.toContain('Stash Me');
   });

   it('categoryFilter restricts to one section', () => {
      const snapshot = {
         cards: [
            { name: 'Sol Ring', primary_category: 'Ramp', set_code: 'cmm', collector_number: '1' },
            { name: 'Counterspell', primary_category: 'Interaction', set_code: 'cmm', collector_number: '2' },
         ],
      };
      const names = CutCandidates.buildCutCandidates(snapshot, {
         categoryFilter: 'Ramp',
      }).map((o) => o.name);
      expect(names).toEqual(['Sol Ring']);
   });

   it('includeOutQueue adds New Set Out cards even when main deck has options', () => {
      const names = CutCandidates.buildCutCandidates(commanderSnapshot(), {
         includeOutQueue: true,
         excludeMaybeboard: true,
      }).map((o) => o.name);
      expect(names).toContain('Sol Ring');
      expect(names).toContain('Cut Card');
   });

   it('outQueueFallback adds out-queue only when main deck scan is empty', () => {
      const emptyMain = {
         cards: [
            { name: 'New Card', primary_category: 'New Set In', set_code: 'nin', collector_number: '1' },
            { name: 'Cut Card', primary_category: 'New Set Out', set_code: 'nout', collector_number: '1' },
         ],
      };
      const names = CutCandidates.buildCutCandidates(emptyMain, {
         outQueueFallback: true,
      }).map((o) => o.name);
      expect(names).toEqual(['Cut Card']);
   });

   it('dedupes duplicate printings via optionKey', () => {
      const snapshot = {
         cards: [
            { name: 'Sol Ring', primary_category: 'Ramp', set_code: 'cmm', collector_number: '1' },
            { name: 'Sol Ring', primary_category: 'Ramp', set_code: 'cmm', collector_number: '1' },
         ],
      };
      const opts = CutCandidates.buildCutCandidates(snapshot);
      expect(opts).toHaveLength(1);
   });

   it('sortByName orders results alphabetically', () => {
      const snapshot = {
         cards: [
            { name: 'Zuran Orb', primary_category: 'Ramp', set_code: 'ice', collector_number: '1' },
            { name: 'Arcane Signet', primary_category: 'Ramp', set_code: 'cmm', collector_number: '2' },
         ],
      };
      const names = CutCandidates.buildCutCandidates(snapshot, { sortByName: true }).map((o) => o.name);
      expect(names).toEqual(['Arcane Signet', 'Zuran Orb']);
   });

   it('accepts a deck object with deck_snapshot', () => {
      const deck = { deck_snapshot: commanderSnapshot() };
      const names = CutCandidates.buildCutCandidates(deck, { excludeMaybeboard: true }).map((o) => o.name);
      expect(names).toContain('Sol Ring');
      expect(names).not.toContain('Stash Me');
   });

   it('returns empty array for missing snapshot', () => {
      expect(CutCandidates.buildCutCandidates(null)).toEqual([]);
      expect(CutCandidates.buildCutCandidates({ cards: null })).toEqual([]);
   });
});

describe('CutCandidates constants', () => {
   it('exports protected and swap category constants', () => {
      expect(CutCandidates.PROTECTED_CATEGORIES.Commander).toBe(true);
      expect(CutCandidates.SWAP_IN).toBe('New Set In');
      expect(CutCandidates.SWAP_OUT).toBe('New Set Out');
   });
});
