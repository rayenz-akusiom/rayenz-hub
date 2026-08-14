import { useEffect, useState } from 'react';

export type SwapQueueCurrency = 'CAD' | 'USD';

export const CURRENCY_STORAGE_KEY = 'rayenzHubSwapQueueCurrency';
export const SHOW_PRICES_STORAGE_KEY = 'rayenzHubSwapQueueShowPrices';
export const PRICE_PREFS_CHANGE_EVENT = 'rayenz-hub-swap-queue-price-prefs';

export const CAD_FX_DISCLAIMER =
  'CAD is Bank of Canada FX on Scryfall USD — not Canadian store prices.';

export function loadSwapQueueCurrency(): SwapQueueCurrency {
  try {
    const raw = localStorage.getItem(CURRENCY_STORAGE_KEY);
    if (raw === 'USD' || raw === 'CAD') return raw;
  } catch {
    /* ignore */
  }
  return 'CAD';
}

export function saveSwapQueueCurrency(currency: SwapQueueCurrency): void {
  try {
    localStorage.setItem(CURRENCY_STORAGE_KEY, currency);
  } catch {
    /* ignore */
  }
  dispatchPrefsChange();
}

export function loadAlwaysShowPrices(): boolean {
  try {
    return localStorage.getItem(SHOW_PRICES_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveAlwaysShowPrices(show: boolean): void {
  try {
    localStorage.setItem(SHOW_PRICES_STORAGE_KEY, show ? '1' : '0');
  } catch {
    /* ignore */
  }
  dispatchPrefsChange();
}

function dispatchPrefsChange(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(PRICE_PREFS_CHANGE_EVENT));
  }
}

export function useSwapQueuePricePrefs(): {
  currency: SwapQueueCurrency;
  setCurrency: (next: SwapQueueCurrency) => void;
  alwaysShowPrices: boolean;
  setAlwaysShowPrices: (next: boolean) => void;
} {
  const [currency, setCurrencyState] = useState<SwapQueueCurrency>(loadSwapQueueCurrency);
  const [alwaysShowPrices, setAlwaysShowState] = useState(loadAlwaysShowPrices);

  useEffect(() => {
    function refresh() {
      setCurrencyState(loadSwapQueueCurrency());
      setAlwaysShowState(loadAlwaysShowPrices());
    }
    function onStorage(e: StorageEvent) {
      if (e.key === CURRENCY_STORAGE_KEY || e.key === SHOW_PRICES_STORAGE_KEY) refresh();
    }
    window.addEventListener(PRICE_PREFS_CHANGE_EVENT, refresh);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(PRICE_PREFS_CHANGE_EVENT, refresh);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  return {
    currency,
    setCurrency: (next) => {
      saveSwapQueueCurrency(next);
      setCurrencyState(next);
    },
    alwaysShowPrices,
    setAlwaysShowPrices: (next) => {
      saveAlwaysShowPrices(next);
      setAlwaysShowState(next);
    },
  };
}

export function formatPricePrimary(
  usd: number | null,
  currency: SwapQueueCurrency,
  fxRate: number | null,
): string {
  if (usd == null) return '—';
  if (currency === 'CAD' && fxRate != null && fxRate > 0) {
    return `CA$${usdToCadDisplay(usd, fxRate)}`;
  }
  return `$${usd.toFixed(2)}`;
}

function usdToCadDisplay(usd: number, rate: number): string {
  return (usd * rate).toFixed(2);
}

export function priceBadgeTitle(
  usd: number | null,
  currency: SwapQueueCurrency,
  fxRate: number | null,
): string {
  if (usd == null) return 'Price unavailable';
  if (currency === 'CAD' && fxRate != null && fxRate > 0) {
    return `CA$${(usd * fxRate).toFixed(2)} ($${usd.toFixed(2)} USD). ${CAD_FX_DISCLAIMER}`;
  }
  return `$${usd.toFixed(2)} USD`;
}
