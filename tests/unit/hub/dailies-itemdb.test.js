import { describe, expect, it, beforeEach } from 'vitest';
import { readHubFile, runInWindow } from '../helpers/hubHarness.js';

describe('dailies itemdb picker', () => {
   beforeEach(() => {
      runInWindow(readHubFile('apps/dailies/dailies-itemdb.js'));
   });

   it('picks first non-hidden tradeable item in list order', () => {
      const info = [
         { item_iid: 1, order: 0, isHidden: true },
         { item_iid: 2, order: 1, isHidden: false },
         { item_iid: 3, order: 2, isHidden: false }
      ];
      const itemdata = [
         { internal_id: 1, name: 'Hidden Item', specialType: 'trading', isNC: false },
         { internal_id: 2, name: 'First Tradeable', specialType: 'trading', isNC: false, findAt: { shopWizard: 'https://example/ssw' } },
         { internal_id: 3, name: 'Second Tradeable', specialType: 'trading', isNC: false }
      ];
      const picked = window.DailiesItemdb.pickFirstTradeableItem(info, itemdata);
      expect(picked.name).toBe('First Tradeable');
   });

   it('skips NC items', () => {
      const info = [{ item_iid: 5, order: 0, isHidden: false }];
      const itemdata = [{ internal_id: 5, name: 'NC Item', specialType: 'trading', isNC: true }];
      expect(window.DailiesItemdb.pickFirstTradeableItem(info, itemdata)).toBeNull();
   });
});
