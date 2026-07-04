import { describe, expect, it, beforeEach, vi } from 'vitest';
import { readHubFile, runInWindow } from '../helpers/hubHarness.js';

describe('dailies timed cards', () => {
   beforeEach(() => {
      runInWindow(readHubFile('apps/dailies/dailies-settings.js'));
      runInWindow(readHubFile('apps/dailies/dailies-timed.js'));
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
});
