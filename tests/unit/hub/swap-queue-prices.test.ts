import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cadToUsd,
  parseBocFxUsdCad,
  usdToCad,
} from '../../../packages/web/src/swap-queue/fx-cad.ts';
import { pickScryfallUsd } from '../../../packages/web/src/swap-queue/enrich-prices.ts';
import {
  formatPricePrimary,
  loadSwapQueueCurrency,
  priceBadgeTitle,
  CURRENCY_STORAGE_KEY,
  SHOW_PRICES_STORAGE_KEY,
  loadAlwaysShowPrices,
  CAD_FX_DISCLAIMER,
} from '../../../packages/web/src/swap-queue/price-prefs.ts';

afterEach(() => {
  localStorage.removeItem(CURRENCY_STORAGE_KEY);
  localStorage.removeItem(SHOW_PRICES_STORAGE_KEY);
});

describe('fx-cad', () => {
  it('parses Bank of Canada Valet FXUSDCAD observations', () => {
    expect(
      parseBocFxUsdCad({
        observations: [{ d: '2026-08-13', FXUSDCAD: { v: '1.3721' } }],
      }),
    ).toEqual({ rate: 1.3721, date: '2026-08-13' });
    expect(parseBocFxUsdCad({ observations: [] })).toBeNull();
    expect(parseBocFxUsdCad(null)).toBeNull();
  });

  it('converts usd ↔ cad', () => {
    expect(usdToCad(10, 1.35)).toBeCloseTo(13.5);
    expect(cadToUsd(13.5, 1.35)).toBeCloseTo(10);
  });
});

describe('enrich-prices foil pick', () => {
  it('prefers usd_foil when foil, else usd', () => {
    const card = { prices: { usd: '2.00', usd_foil: '5.50' } };
    expect(pickScryfallUsd(card, true)).toBe(5.5);
    expect(pickScryfallUsd(card, false)).toBe(2);
    expect(pickScryfallUsd({ prices: { usd: '2.00' } }, true)).toBe(2);
  });
});

describe('price-prefs', () => {
  it('defaults currency to CAD and always-show off', () => {
    expect(loadSwapQueueCurrency()).toBe('CAD');
    expect(loadAlwaysShowPrices()).toBe(false);
  });

  it('formats primary price in CAD or USD', () => {
    expect(formatPricePrimary(4.2, 'USD', null)).toBe('$4.20');
    expect(formatPricePrimary(4.2, 'CAD', 1.35)).toBe('CA$5.67');
    expect(formatPricePrimary(null, 'CAD', 1.35)).toBe('—');
    expect(formatPricePrimary(4.2, 'CAD', null)).toBe('$4.20');
  });

  it('includes disclaimer in CAD title', () => {
    const title = priceBadgeTitle(4.2, 'CAD', 1.35);
    expect(title).toContain('CA$5.67');
    expect(title).toContain('$4.20 USD');
    expect(title).toContain(CAD_FX_DISCLAIMER);
  });
});
