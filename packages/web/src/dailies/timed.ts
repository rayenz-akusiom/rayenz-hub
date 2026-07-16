import type { DailiesSettingsPayload } from '@rayenz-hub/shared';

const FREEBIES_DISMISS_PREFIX = 'rayenz-dismiss-freebies-';

export const SEASONAL_OVERRIDE = {
  enabled: false,
  mode: 'all' as 'all' | 'simulate',
  simulateNst: new Date(2025, 11, 15),
};

export function getNstDate(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
}

export function isVonRooActive(nst: Date): boolean {
  if (nst.getMonth() === 9 && nst.getDate() === 31) {
    return true;
  }
  return nst.getHours() === 0;
}

export function isAltadorCupActive(nst: Date): boolean {
  const month = nst.getMonth();
  const day = nst.getDate();
  if (month === 5 && day >= 22) {
    return true;
  }
  return month === 6 && day <= 14;
}

export type TimedCard = {
  id: string;
  name: string;
  url: string;
  img: string;
  note: string;
  styleClass: string;
  kind: 'seasonal' | 'timed';
  dismissOnClick?: 'month';
  isActive: (
    nst: Date,
    settings?: DailiesSettingsPayload | Record<string, never>,
    now?: Date,
  ) => boolean;
};

export const SEASONAL_EVENTS: TimedCard[] = [
  {
    id: 'altador-cup',
    name: 'Altador Cup',
    url: 'https://www.neopets.com/altador/colosseum/',
    img: 'https://images.neopets.com/items/toy_altador_cup_gold_whistle.gif',
    note: 'Press tour trivia · sign-ups · tournament through July 14',
    styleClass: 'seasonal-alert--altador',
    kind: 'seasonal',
    isActive: isAltadorCupActive,
  },
  {
    id: 'advent',
    name: 'Advent Calendar',
    url: 'https://www.neopets.com/winter/adventcalendar.phtml',
    img: 'https://images.neopets.com/items/fur_mistletoe_wreath.gif',
    note: 'Once per day in December',
    styleClass: 'seasonal-alert--festive',
    kind: 'seasonal',
    isActive: (nst) => nst.getMonth() === 11,
  },
  {
    id: 'deadly-dice',
    name: 'Deadly Dice',
    url: 'https://www.neopets.com/worlds/deadlydice.phtml',
    img: 'https://images.neopets.com/items/plu_von_roo.gif',
    note: 'Midnight hour NST · all day on Halloween',
    styleClass: 'seasonal-alert--midnight',
    kind: 'seasonal',
    isActive: isVonRooActive,
  },
];

export const TIMED_CARDS: TimedCard[] = [
  {
    id: 'snowager',
    name: 'Snowager',
    url: 'https://www.neopets.com/winter/snowager.phtml',
    img: 'https://images.neopets.com/items/toy_snowager_plushie.gif',
    note: '6–7am, 2–3pm, 10–11pm NST',
    styleClass: 'seasonal-alert--winter',
    kind: 'timed',
    isActive: (nst) => {
      const h = nst.getHours();
      return h === 6 || h === 14 || h === 22;
    },
  },
  {
    id: 'monthly-freebies',
    name: 'Monthly Freebies',
    url: 'https://www.neopets.com/freebies/',
    img: 'https://images.neopets.com/items/fur_y7_calendar.gif',
    note: 'Once a month',
    styleClass: 'seasonal-alert--festive',
    kind: 'timed',
    dismissOnClick: 'month',
    isActive: () => !isFreebiesDismissed(),
  },
  {
    id: 'magma-pool',
    name: 'Magma Pool',
    url: 'https://www.neopets.com/magma/pool.phtml',
    img: 'https://images.neopets.com/items/bg_magma_pool.gif',
    note: 'Your open window',
    styleClass: 'seasonal-alert--magma',
    kind: 'timed',
    isActive: (_nst, settings) => isMagmaPoolWindowActive(settings),
  },
];

export function monthKey(date?: Date): string {
  const d = date || new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

export function isFreebiesDismissed(date?: Date): boolean {
  try {
    return localStorage.getItem(FREEBIES_DISMISS_PREFIX + monthKey(date)) === '1';
  } catch {
    return false;
  }
}

export function dismissFreebies(date?: Date): void {
  try {
    localStorage.setItem(FREEBIES_DISMISS_PREFIX + monthKey(date), '1');
  } catch {
    /* ignore */
  }
}

export function parseLocalTime(timeStr: string | undefined): { hours: number; minutes: number } {
  const parts = String(timeStr || '14:47').split(':');
  return {
    hours: parseInt(parts[0], 10) || 0,
    minutes: parseInt(parts[1], 10) || 0,
  };
}

export function isMagmaPoolWindowActive(
  settings?: DailiesSettingsPayload | Record<string, never> | null,
): boolean {
  const s = settings || {};
  const parsed = parseLocalTime(s.magmaPoolLocalTime);
  const buffer =
    typeof s.magmaPoolBufferMinutes === 'number'
      ? s.magmaPoolBufferMinutes
      : parseInt(String(s.magmaPoolBufferMinutes), 10) || 15;
  const now = new Date();
  const target = new Date(now);
  target.setHours(parsed.hours, parsed.minutes, 0, 0);
  const diffMs = Math.abs(now.getTime() - target.getTime());
  return diffMs <= buffer * 60 * 1000;
}

export function getActiveCards(
  settings: DailiesSettingsPayload | Record<string, never>,
  now?: Date,
): TimedCard[] {
  let nst = getNstDate();
  if (SEASONAL_OVERRIDE.enabled && SEASONAL_OVERRIDE.mode === 'simulate') {
    nst = SEASONAL_OVERRIDE.simulateNst;
  }

  const seasonal = SEASONAL_EVENTS.filter((event) => {
    if (SEASONAL_OVERRIDE.enabled && SEASONAL_OVERRIDE.mode === 'all') {
      return true;
    }
    return event.isActive(nst);
  });

  const timed = TIMED_CARDS.filter((card) => card.isActive(nst, settings, now));

  return seasonal.concat(timed);
}

export function handleCardClick(card: TimedCard): void {
  if (card.dismissOnClick === 'month') {
    dismissFreebies();
  }
}

export function msUntilNextNstMidnight(): number {
  const nst = getNstDate();
  const next = new Date(nst);
  next.setDate(nst.getDate() + 1);
  next.setHours(0, 0, 0, 0);
  return Math.max(1000, next.getTime() - nst.getTime());
}

export function msUntilNextNstHour(): number {
  const nst = getNstDate();
  const next = new Date(nst);
  next.setMinutes(0, 0, 0);
  next.setHours(nst.getHours() + 1);
  return Math.max(1000, next.getTime() - nst.getTime());
}

export function msUntilNextLocalMinute(): number {
  const now = new Date();
  const next = new Date(now);
  next.setSeconds(0, 0);
  next.setMinutes(now.getMinutes() + 1);
  return Math.max(1000, next.getTime() - now.getTime());
}
