/*
 * Wishing Well automation — normalized localStorage state.
 *
 * Key: rayenz-wishing-well-state
 * Shape: { formatVersion, periodKey, wish, donation, lastWishCount, status, lastError, updatedAt }
 *
 * Legacy keys (migrated on load): rayenz-wishing-well-wish, -donation, -period
 */

import type { NeopetsBridgeResponse } from '../lib/neopets-bridge';

const WISHING_STATE_KEY = 'rayenz-wishing-well-state';
const WISHING_STATE_FORMAT = 1;
const WISHING_WISH_KEY = 'rayenz-wishing-well-wish';
const WISHING_DONATION_KEY = 'rayenz-wishing-well-donation';
const WISHING_PERIOD_KEY = 'rayenz-wishing-well-period';

export const WISHING_MAX = 7;

export type WishingWellStatus = 'idle' | 'complete' | 'error';

export type WishingWellState = {
  formatVersion: number;
  periodKey: string;
  wish: string;
  donation: number;
  lastWishCount: number | null;
  status: WishingWellStatus;
  lastError: string | null;
  updatedAt: number;
};

export type WishingPostOutcome = {
  ok: boolean;
  error: string | null;
  wishCount: number | null;
};

function storageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

function getNstDate(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
}

export function getWishingPeriodKey(): string {
  const nst = getNstDate();
  let y = nst.getFullYear();
  let m = nst.getMonth();
  let d = nst.getDate();
  const hour = nst.getHours();
  let slot: string;

  if (hour >= 8 && hour < 20) {
    slot = 'day';
  } else {
    slot = 'night';
    if (hour < 8) {
      const prev = new Date(nst);
      prev.setDate(prev.getDate() - 1);
      y = prev.getFullYear();
      m = prev.getMonth();
      d = prev.getDate();
    }
  }

  return y + '-' + m + '-' + d + '-' + slot;
}

function emptyState(periodKey?: string): WishingWellState {
  return {
    formatVersion: WISHING_STATE_FORMAT,
    periodKey: periodKey || getWishingPeriodKey(),
    wish: '',
    donation: 21,
    lastWishCount: null,
    status: 'idle',
    lastError: null,
    updatedAt: 0,
  };
}

function migrateLegacyState(periodKey: string): WishingWellState {
  const wish = storageGet(WISHING_WISH_KEY) || '';
  const donationRaw = storageGet(WISHING_DONATION_KEY);
  const donation = donationRaw ? parseInt(donationRaw, 10) : 21;
  const legacyPeriod = storageGet(WISHING_PERIOD_KEY);
  const status: WishingWellStatus = legacyPeriod === periodKey ? 'complete' : 'idle';
  try {
    localStorage.removeItem(WISHING_WISH_KEY);
    localStorage.removeItem(WISHING_DONATION_KEY);
    localStorage.removeItem(WISHING_PERIOD_KEY);
  } catch {
    /* ignore */
  }
  return {
    formatVersion: WISHING_STATE_FORMAT,
    periodKey,
    wish,
    donation: isNaN(donation) ? 21 : donation,
    lastWishCount: null,
    status,
    lastError: null,
    updatedAt: Date.now(),
  };
}

export function loadWishingWellState(): WishingWellState {
  const periodKey = getWishingPeriodKey();
  const raw = storageGet(WISHING_STATE_KEY);
  let state: WishingWellState | null = null;
  if (raw) {
    try {
      state = JSON.parse(raw) as WishingWellState;
    } catch {
      state = null;
    }
  }
  if (!state || state.formatVersion !== WISHING_STATE_FORMAT) {
    state = migrateLegacyState(periodKey);
    saveWishingWellState(state);
    return state;
  }
  if (state.periodKey !== periodKey) {
    const prevWish = state.wish;
    const prevDonation = state.donation;
    state = emptyState(periodKey);
    state.wish = prevWish || '';
    state.donation = prevDonation || 21;
    saveWishingWellState(state);
  }
  return state;
}

export function saveWishingWellState(state: WishingWellState): void {
  state.updatedAt = Date.now();
  storageSet(WISHING_STATE_KEY, JSON.stringify(state));
}

export function isWishingPeriodComplete(state?: WishingWellState): boolean {
  const s = state ?? loadWishingWellState();
  return s.status === 'complete' && s.periodKey === getWishingPeriodKey();
}

export function markWishingPeriodComplete(state?: WishingWellState): void {
  const s = state ?? loadWishingWellState();
  s.periodKey = getWishingPeriodKey();
  s.status = 'complete';
  s.lastError = null;
  saveWishingWellState(s);
}

export function updateWishingPreferences(
  wish: string | null | undefined,
  donation: number | null | undefined,
): void {
  const state = loadWishingWellState();
  if (wish != null && String(wish).trim()) {
    state.wish = String(wish).trim();
  }
  if (donation != null && !isNaN(donation)) {
    state.donation = donation;
  }
  saveWishingWellState(state);
}

export function parseWishCount(html: string): number | null {
  const match = html.match(/Wish Count:\s*(\d+)/i);
  if (match) {
    return parseInt(match[1], 10);
  }
  if (/process_wishing|Make a Wish/i.test(html)) {
    return WISHING_MAX;
  }
  return null;
}

export function parseWishingForm(html: string): Record<string, string> | null {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const form = doc.querySelector('form[action*="process_wishing"]');
  if (!form) {
    return null;
  }

  const data: Record<string, string> = {};
  const fields = form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
    'input[name], select[name], textarea[name]',
  );
  for (const field of fields) {
    if (field.type === 'submit' || field.type === 'button') {
      if (field.name) {
        data[field.name] = field.value;
      }
      continue;
    }
    if (field.type === 'radio' || field.type === 'checkbox') {
      if ((field as HTMLInputElement).checked) {
        data[field.name] = field.value;
      }
      continue;
    }
    data[field.name] = field.value;
  }

  return data;
}

export function parseWishingError(html: string): string | null {
  if (/do not have enough/i.test(html)) {
    return 'Not enough Neopoints for that donation.';
  }
  if (/must donate at least 21|minimum of 21/i.test(html)) {
    return 'Donation must be at least 21 NP.';
  }
  if (/already made|seven wishes|7 wishes|no more wishes/i.test(html)) {
    return 'Already submitted the maximum wishes for this period.';
  }
  if (/Oops|error|invalid/i.test(html) && html.length < 5000) {
    const plain = html
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (plain.length > 0 && plain.length < 200) {
      return plain;
    }
  }
  return null;
}

export function evaluateWishingPost(
  response: NeopetsBridgeResponse,
  beforeCount: number | null,
): WishingPostOutcome {
  const html = response.text || '';
  const url = response.url || '';

  if (/Thanks for your donation|Thank you for your donation/i.test(html)) {
    return { ok: true, error: null, wishCount: parseWishCount(html) };
  }
  if (/[?&]thanks=/i.test(url)) {
    return { ok: true, error: null, wishCount: parseWishCount(html) };
  }

  const afterCount = parseWishCount(html);
  if (afterCount !== null && beforeCount !== null && afterCount > beforeCount) {
    return { ok: true, error: null, wishCount: afterCount };
  }

  return {
    ok: false,
    error: parseWishingError(html) || 'Unexpected response from Wishing Well.',
    wishCount: afterCount,
  };
}

export function buildWishingPayload(
  formData: Record<string, string>,
  wishText: string,
  donation: number,
): Record<string, string> {
  const payload: Record<string, string> = {
    ...formData,
    donation: String(donation),
    wish: wishText,
  };
  if ('amount' in formData) {
    payload.amount = String(donation);
  }
  return payload;
}

export function encodeForm(data: Record<string, string>): string {
  return Object.keys(data)
    .map((key) => encodeURIComponent(key) + '=' + encodeURIComponent(data[key]))
    .join('&');
}

export function recordWishingOutcome(state: WishingWellState, outcome: WishingPostOutcome): WishingWellState {
  if (outcome.wishCount != null) {
    state.lastWishCount = outcome.wishCount;
  }
  if (outcome.ok) {
    state.lastError = null;
    state.status = outcome.wishCount != null && outcome.wishCount >= WISHING_MAX ? 'complete' : 'idle';
  } else {
    state.status = 'error';
    state.lastError = outcome.error;
  }
  saveWishingWellState(state);
  console.info('[Dailies Wishing Well] state', JSON.stringify(state));
  return state;
}
