import { describe, expect, it, beforeEach, vi } from 'vitest';
import * as DailiesTimed from '../../../packages/web/src/dailies/timed.ts';
import { installDailiesGlobals } from './installDailiesGlobals.ts';

describe('dailies timed cards', () => {
   beforeEach(() => {
      
      installDailiesGlobals();
localStorage.clear();
   });

   it('shows Snowager during NST window hours', () => {
      const nst = new Date('2026-07-04T14:30:00-07:00');
      vi.useFakeTimers();
      vi.setSystemTime(nst);
      const cards = window.DailiesTimed.getActiveCards({}, nst);
      expect(cards.some((c) => c.id === 'snowager')).toBe(true);
      vi.useRealTimers();
   });

   it('hides monthly freebies after dismiss for the month', () => {
      window.DailiesTimed.dismissFreebies(new Date(2026, 6, 15));
      expect(window.DailiesTimed.isFreebiesDismissed(new Date(2026, 6, 20))).toBe(true);
      expect(window.DailiesTimed.isFreebiesDismissed(new Date(2026, 7, 1))).toBe(false);
   });

   it('shows magma pool within configured local buffer', () => {
      const settings = { magmaPoolLocalTime: '14:47', magmaPoolBufferMinutes: 15 };
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-07-04T14:50:00'));
      expect(window.DailiesTimed.isMagmaPoolWindowActive(settings)).toBe(true);
      vi.setSystemTime(new Date('2026-07-04T15:10:00'));
      expect(window.DailiesTimed.isMagmaPoolWindowActive(settings)).toBe(false);
      vi.useRealTimers();
   });

   it('seasonal events activate during configured windows', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-07-04T14:30:00-07:00'));
      expect(DailiesTimed.isAltadorCupActive(DailiesTimed.getNstDate())).toBe(true);
      vi.setSystemTime(new Date('2026-10-31T00:30:00-07:00'));
      expect(DailiesTimed.isVonRooActive(DailiesTimed.getNstDate())).toBe(true);
      vi.useRealTimers();
   });

   it('getActiveCards includes seasonal override and handleCardClick dismisses freebies', () => {
      const original = { ...DailiesTimed.SEASONAL_OVERRIDE };
      DailiesTimed.SEASONAL_OVERRIDE.enabled = true;
      DailiesTimed.SEASONAL_OVERRIDE.mode = 'all';
      const cards = DailiesTimed.getActiveCards({});
      expect(cards.some((c) => c.id === 'altador-cup')).toBe(true);
      DailiesTimed.handleCardClick({ dismissOnClick: 'month' } as never);
      expect(DailiesTimed.isFreebiesDismissed()).toBe(true);
      DailiesTimed.SEASONAL_OVERRIDE.enabled = original.enabled;
      DailiesTimed.SEASONAL_OVERRIDE.mode = original.mode;
   });

   it('msUntil helpers return positive delays', () => {
      expect(DailiesTimed.msUntilNextNstMidnight()).toBeGreaterThan(0);
      expect(DailiesTimed.msUntilNextNstHour()).toBeGreaterThan(0);
      expect(DailiesTimed.msUntilNextLocalMinute()).toBeGreaterThan(0);
      expect(DailiesTimed.monthKey(new Date(2026, 6, 4))).toBe('2026-07');
   });

   it('parseLocalTime defaults invalid values to zero', () => {
      expect(DailiesTimed.parseLocalTime('bad')).toEqual({ hours: 0, minutes: 0 });
   });
});
