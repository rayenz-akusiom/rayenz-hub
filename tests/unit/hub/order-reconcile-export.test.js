import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadHubModule, resetHubModules } from '../helpers/hubHarness.js';

let ORE;

beforeEach(() => {
   resetHubModules();
   loadHubModule('apps/deck-review/archidekt-export.js', 'ArchidektExport');
   loadHubModule('shared/swap-queue.js', 'SwapQueue');
   ORE = loadHubModule('apps/order-reconcile/order-reconcile-export.js', 'OrderReconcileExport');
});

afterEach(() => {
   resetHubModules();
});

describe('OrderReconcileExport.isCubeDeck', () => {
   it('detects cube decks by name', () => {
      expect(ORE.isCubeDeck({ deck_name: 'My Vintage Cube' })).toBe(true);
      expect(ORE.isCubeDeck({ deck_name: 'Atraxa Superfriends' })).toBe(false);
   });
});

describe('OrderReconcileExport.namesMatch', () => {
   it('matches identical names case-insensitively', () => {
      expect(ORE.namesMatch('Sol Ring', 'sol ring')).toBe(true);
   });

   it('matches a double-faced card against a single face', () => {
      expect(ORE.namesMatch('Fire // Ice', 'Fire')).toBe(true);
      expect(ORE.namesMatch('Fire', 'Fire // Ice')).toBe(true);
   });

   it('does not match unrelated names', () => {
      expect(ORE.namesMatch('Sol Ring', 'Mana Crypt')).toBe(false);
   });
});

describe('OrderReconcileExport.cubeColorCategory', () => {
   it('maps mono and guild color identities', () => {
      expect(ORE.cubeColorCategory([])).toBe('Colorless');
      expect(ORE.cubeColorCategory(['G'])).toBe('Green');
      expect(ORE.cubeColorCategory(['W', 'U'])).toBe('Azorius');
      expect(ORE.cubeColorCategory(['U', 'W'])).toBe('Azorius');
   });
});

describe('OrderReconcileExport.resolveCubeDestinationCategory', () => {
   const snapshot = {
      cards: [
         { name: 'Azorius Card', primary_category: 'Azorius' },
         { name: 'Some Ramp', primary_category: 'Ramp' },
      ],
   };

   it('returns the color category when present in the deck', () => {
      expect(ORE.resolveCubeDestinationCategory(snapshot, ['W', 'U'])).toBe('Azorius');
   });

   it('returns empty when the deck has no matching color category', () => {
      expect(ORE.resolveCubeDestinationCategory(snapshot, ['G'])).toBe('');
   });
});

describe('OrderReconcileExport.deriveSwapQueue / pairSwapSlots', () => {
   const snapshot = {
      cards: [
         { name: 'Queue In', primary_category: 'New Set In', quantity: 1, set_code: 'qin', collector_number: '1' },
         { name: 'Queue Out', primary_category: 'New Set Out', quantity: 1, set_code: 'qout', collector_number: '1' },
         { name: 'Sol Ring', primary_category: 'Ramp', quantity: 1, set_code: 'cmm', collector_number: '1' },
      ],
   };

   it('splits the snapshot into in/out queues', () => {
      const queue = ORE.deriveSwapQueue(snapshot);
      expect(queue.new_set_in.map((c) => c.name)).toEqual(['Queue In']);
      expect(queue.new_set_out.map((c) => c.name)).toEqual(['Queue Out']);
   });

   it('pairs in/out slots by index', () => {
      const queue = ORE.deriveSwapQueue(snapshot);
      const pairs = ORE.pairSwapSlots(queue.new_set_in, queue.new_set_out);
      expect(pairs).toHaveLength(1);
      expect(pairs[0].in.name).toBe('Queue In');
      expect(pairs[0].out.name).toBe('Queue Out');
      expect(pairs[0].index).toBe(0);
   });

   it('returns empty queues when snapshot is null or missing cards', () => {
      expect(ORE.deriveSwapQueue(null)).toEqual({
         new_set_in: [],
         new_set_out: [],
         metadata_flags: [],
      });
      expect(ORE.deriveSwapQueue({})).toEqual({
         new_set_in: [],
         new_set_out: [],
         metadata_flags: [],
      });
   });
});

describe('OrderReconcileExport.deriveMaybeboard', () => {
   it('returns only Maybeboard cards', () => {
      const snapshot = {
         cards: [
            { name: 'MB One', primary_category: 'Maybeboard' },
            { name: 'Main One', primary_category: 'Ramp' },
         ],
      };
      expect(ORE.deriveMaybeboard(snapshot).map((c) => c.name)).toEqual(['MB One']);
   });
});

describe('OrderReconcileExport.deckReconcileComplete', () => {
   it('treats an empty list as complete', () => {
      expect(ORE.deckReconcileComplete([], () => null))
         .toEqual({ complete: true, reviewed: 0, total: 0 });
   });

   it('reports incomplete when an item lacks a decision', () => {
      const items = [{ item_id: 'a' }, { item_id: 'b' }];
      const decisions = { a: { status: 'accepted' } };
      expect(ORE.deckReconcileComplete(items, (id) => decisions[id]))
         .toEqual({ complete: false, reviewed: 1, total: 2 });
   });
});

describe('OrderReconcileExport.buildReconcileDeckImport', () => {
   const snapshot = {
      cards: [
         { name: 'Keeper', set_code: 'aaa', collector_number: '1', quantity: 1, primary_category: 'Ramp' },
         { name: 'Cut Me', set_code: 'bbb', collector_number: '2', quantity: 1, primary_category: 'Ramp' },
         { name: 'Queue In', primary_category: 'New Set In', quantity: 1, set_code: 'qin', collector_number: '1' },
         { name: 'Queue Out', primary_category: 'New Set Out', quantity: 1, set_code: 'qout', collector_number: '1' },
      ],
   };
   const acceptedItems = [{
      status: 'accepted',
      slot_key: 'manual-slot',
      accepted: {
         card_in: { name: 'Sol Ring', set_code: 'cmm', collector_number: '1', finish: 'foil' },
         destination_category: 'Ramp',
         quantity: 1,
         card_out: { name: 'Cut Me', set_code: 'bbb', collector_number: '2' },
      },
   }];

   it('keeps unchanged cards and adds the accepted card with its finish', () => {
      const text = ORE.buildReconcileDeckImport('d1', snapshot, acceptedItems, acceptedItems);
      expect(text).toContain('1x Keeper (aaa) 1 [Ramp]');
      expect(text).toContain('1x Sol Ring (cmm) 1 *F* [Ramp]');
   });

   it('removes the cut card from the deck', () => {
      const text = ORE.buildReconcileDeckImport('d1', snapshot, acceptedItems, acceptedItems);
      expect(text).not.toContain('Cut Me');
   });

   it('still emits the unfulfilled swap queue in/out lines', () => {
      const text = ORE.buildReconcileDeckImport('d1', snapshot, acceptedItems, acceptedItems);
      expect(text).toContain('1x Queue In (qin) 1 [New Set In{noDeck}{noPrice}]');
      expect(text).toContain('1x Queue Out (qout) 1 [New Set Out]');
   });

   it('removes an accepted card from the maybeboard', () => {
      const mbSnapshot = {
         cards: [
            { name: 'MB Card', set_code: 'mb', collector_number: '1', quantity: 1, primary_category: 'Maybeboard' },
            { name: 'Keeper', set_code: 'aaa', collector_number: '1', quantity: 1, primary_category: 'Ramp' },
         ],
      };
      const mbAccepted = [{
         status: 'accepted',
         slot_key: 'mb-slot',
         accepted: {
            card_in: { name: 'MB Card', set_code: 'mb', collector_number: '1' },
            destination_category: 'Ramp',
            quantity: 1,
            card_out: null,
         },
      }];
      const text = ORE.buildReconcileDeckImport('d1', mbSnapshot, mbAccepted, mbAccepted);
      expect(text).toContain('1x MB Card (mb) 1 [Ramp]');
      expect(text).not.toContain('Maybeboard');
   });

   it('preserves dual categories from the snapshot on unchanged cards', () => {
      const snapshotWithProxy = {
         category_settings: { Proxies: { includedInPrice: false, includedInDeck: true } },
         cards: [
            {
               name: 'Plateau',
               set_code: 'vma',
               collector_number: '308',
               quantity: 1,
               primary_category: 'Land',
               categories: ['Land', 'Proxies'],
            },
            { name: 'Queue In', primary_category: 'New Set In', quantity: 1, set_code: 'qin', collector_number: '1' },
            { name: 'Queue Out', primary_category: 'New Set Out', quantity: 1, set_code: 'qout', collector_number: '1' },
         ],
      };
      const text = ORE.buildReconcileDeckImport('d1', snapshotWithProxy, [], []);
      expect(text).toContain('1x Plateau (vma) 308 [Land,Proxies{noPrice}]');
   });

   it('appends Proxies to accepted card-in lines when isProxyOrder is set', () => {
      const cubeSnapshot = {
         category_settings: { Proxies: { includedInPrice: false, includedInDeck: true } },
         cards: [
            { name: 'Keeper', set_code: 'aaa', collector_number: '1', quantity: 1, primary_category: 'Azorius' },
         ],
      };
      const accepted = [{
         status: 'accepted',
         slot_key: 'slot-1',
         accepted: {
            card_in: { name: 'Sol Ring', set_code: 'cmm', collector_number: '1' },
            destination_category: 'Azorius',
            quantity: 1,
            card_out: null,
         },
      }];
      const text = ORE.buildReconcileDeckImport('d1', cubeSnapshot, accepted, accepted, { isProxyOrder: true });
      expect(text).toContain('1x Sol Ring (cmm) 1 [Azorius,Proxies{noPrice}]');
   });

   it('does not append Proxies when isProxyOrder is false', () => {
      const text = ORE.buildReconcileDeckImport('d1', snapshot, acceptedItems, acceptedItems, { isProxyOrder: false });
      expect(text).toContain('1x Sol Ring (cmm) 1 *F* [Ramp]');
      expect(text).not.toContain('Proxies');
   });
});

describe('OrderReconcileExport.buildStagingCleanupImport', () => {
   it('deducts removed quantities from the staging snapshot', () => {
      const snapshot = {
         cards: [
            { name: 'Buy A', set_code: 'aaa', collector_number: '1', quantity: 2, primary_category: 'Maybeboard' },
         ],
      };
      const removals = [{ name: 'Buy A', set_code: 'aaa', collector_number: '1', quantity: 1 }];
      const text = ORE.buildStagingCleanupImport(snapshot, removals);
      expect(text).toContain('1x Buy A (aaa) 1 [Maybeboard{noDeck}{noPrice}]');
   });
});
