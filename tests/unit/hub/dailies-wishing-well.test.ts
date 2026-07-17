import { describe, expect, it, beforeEach, vi } from 'vitest';
import * as DailiesWishingWell from '../../../packages/web/src/dailies/wishing-well.ts';
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

   it('parseWishCount reads count and max-wish pages', () => {
      expect(DailiesWishingWell.parseWishCount('Wish Count: 4')).toBe(4);
      expect(DailiesWishingWell.parseWishCount('<form action="process_wishing">')).toBe(DailiesWishingWell.WISHING_MAX);
      expect(DailiesWishingWell.parseWishCount('no data')).toBe(null);
   });

   it('parseWishingError surfaces donation and max-wish errors', () => {
      expect(DailiesWishingWell.parseWishingError('You do not have enough Neopoints')).toContain('Neopoints');
      expect(DailiesWishingWell.parseWishingError('You already made seven wishes')).toContain('maximum');
      expect(DailiesWishingWell.parseWishingError('<p>Oops invalid wish</p>')).toContain('Oops');
   });

   it('evaluateWishingPost accepts thanks HTML and donation text', () => {
      const thanks = DailiesWishingWell.evaluateWishingPost({ text: 'Thanks for your donation!', url: '' }, 1);
      expect(thanks.ok).toBe(true);
      const fail = DailiesWishingWell.evaluateWishingPost({ text: 'You do not have enough Neopoints', url: '' }, 1);
      expect(fail.ok).toBe(false);
   });

   it('buildWishingPayload maps amount field and encodes form', () => {
      const payload = DailiesWishingWell.buildWishingPayload({ amount: '21', csrf: 'x' }, 'Paint Brush', 50);
      expect(payload.amount).toBe('50');
      expect(payload.wish).toBe('Paint Brush');
      expect(DailiesWishingWell.encodeForm({ wish: 'A', donation: '21' })).toContain('wish=A');
   });

   it('markWishingPeriodComplete and updateWishingPreferences persist state', () => {
      DailiesWishingWell.updateWishingPreferences('Rainbow Paint Brush', 42);
      const state = DailiesWishingWell.loadWishingWellState();
      expect(state.wish).toBe('Rainbow Paint Brush');
      expect(state.donation).toBe(42);
      DailiesWishingWell.markWishingPeriodComplete(state);
      expect(DailiesWishingWell.isWishingPeriodComplete()).toBe(true);
   });

   it('rolls state forward when period changes', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-07-04T10:00:00-07:00'));
      const first = DailiesWishingWell.loadWishingWellState();
      first.wish = 'Keep Me';
      first.donation = 33;
      DailiesWishingWell.saveWishingWellState(first);
      vi.setSystemTime(new Date('2026-07-04T22:00:00-07:00'));
      const rolled = DailiesWishingWell.loadWishingWellState();
      expect(rolled.wish).toBe('Keep Me');
      expect(rolled.donation).toBe(33);
      expect(rolled.status).toBe('idle');
      vi.useRealTimers();
   });
});
