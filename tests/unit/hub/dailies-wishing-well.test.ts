import { describe, expect, it, beforeEach } from 'vitest';
import { installDailiesGlobals } from './installDailiesGlobals.ts';

describe('dailies wishing well state', () => {
   beforeEach(() => {
      
      installDailiesGlobals();
localStorage.clear();
      });

   it('migrates legacy wish and donation keys into state doc', () => {
      localStorage.setItem('rayenz-wishing-well-wish', 'Rainbow Paint Brush');
      localStorage.setItem('rayenz-wishing-well-donation', '50');
      localStorage.setItem('rayenz-wishing-well-period', window.DailiesWishingWell.getWishingPeriodKey());

      const state = window.DailiesWishingWell.loadWishingWellState();

      expect(state.formatVersion).toBe(1);
      expect(state.wish).toBe('Rainbow Paint Brush');
      expect(state.donation).toBe(50);
      expect(state.status).toBe('complete');
      expect(localStorage.getItem('rayenz-wishing-well-wish')).toBeNull();
   });

   it('evaluateWishingPost accepts thanks URL', () => {
      const result = window.DailiesWishingWell.evaluateWishingPost({
         text: '',
         url: 'https://www.neopets.com/wishing.phtml?thanks=1'
      }, 0);
      expect(result.ok).toBe(true);
   });

   it('evaluateWishingPost detects wish count increase', () => {
      const result = window.DailiesWishingWell.evaluateWishingPost({
         text: 'Wish Count: 2',
         url: 'https://www.neopets.com/wishing.phtml'
      }, 1);
      expect(result.ok).toBe(true);
      expect(result.wishCount).toBe(2);
   });

   it('recordWishingOutcome persists error state', () => {
      const state = window.DailiesWishingWell.loadWishingWellState();
      const updated = window.DailiesWishingWell.recordWishingOutcome(state, {
         ok: false,
         error: 'Not enough Neopoints for that donation.',
         wishCount: null
      });
      expect(updated.status).toBe('error');
      expect(updated.lastError).toContain('Neopoints');
   });
});
