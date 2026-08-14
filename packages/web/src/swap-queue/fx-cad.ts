/** Bank of Canada Valet noon USD/CAD (CAD per 1 USD). */
export const BOC_FXUSDCAD_URL =
  'https://www.bankofcanada.ca/valet/observations/FXUSDCAD/json?recent=1';

export const FX_CACHE_STORAGE_KEY = 'rayenzHubSwapQueueFxUsdCad';

export type FxUsdCad = {
  /** CAD per 1 USD */
  rate: number;
  /** Observation date YYYY-MM-DD */
  date: string;
};

type CachedFx = FxUsdCad & { cachedOn: string };

function todayLocalIsoDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function loadCachedFxUsdCad(): FxUsdCad | null {
  try {
    const raw = localStorage.getItem(FX_CACHE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedFx;
    if (
      typeof parsed?.rate !== 'number' ||
      !Number.isFinite(parsed.rate) ||
      parsed.rate <= 0 ||
      typeof parsed.date !== 'string' ||
      typeof parsed.cachedOn !== 'string'
    ) {
      return null;
    }
    if (parsed.cachedOn !== todayLocalIsoDate()) return null;
    return { rate: parsed.rate, date: parsed.date };
  } catch {
    return null;
  }
}

export function saveCachedFxUsdCad(fx: FxUsdCad): void {
  try {
    const payload: CachedFx = { ...fx, cachedOn: todayLocalIsoDate() };
    localStorage.setItem(FX_CACHE_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

/** Parse Valet JSON body for FXUSDCAD. */
export function parseBocFxUsdCad(body: unknown): FxUsdCad | null {
  if (!body || typeof body !== 'object') return null;
  const observations = (body as { observations?: unknown }).observations;
  if (!Array.isArray(observations) || !observations.length) return null;
  const row = observations[observations.length - 1] as {
    d?: string;
    FXUSDCAD?: { v?: string };
  };
  const date = String(row?.d || '').trim();
  const raw = row?.FXUSDCAD?.v;
  const rate = raw != null && raw !== '' ? Number(raw) : NaN;
  if (!date || !Number.isFinite(rate) || rate <= 0) return null;
  return { rate, date };
}

/**
 * Fetch noon USD→CAD rate. Uses same-day localStorage cache when present.
 * Returns null on network/parse failure (caller falls back to USD).
 */
export async function fetchFxUsdCad(): Promise<FxUsdCad | null> {
  const cached = loadCachedFxUsdCad();
  if (cached) return cached;
  try {
    const res = await fetch(BOC_FXUSDCAD_URL);
    if (!res.ok) return null;
    const body: unknown = await res.json();
    const fx = parseBocFxUsdCad(body);
    if (!fx) return null;
    saveCachedFxUsdCad(fx);
    return fx;
  } catch {
    return null;
  }
}

export function usdToCad(usd: number, rate: number): number {
  return usd * rate;
}

export function cadToUsd(cad: number, rate: number): number {
  return cad / rate;
}
