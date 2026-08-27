const STORAGE_KEY = 'rayenz-deck-builder-card-charms';

export type CardCharmsPref = {
  enabled: boolean;
};

export const DEFAULT_CARD_CHARMS_PREF: CardCharmsPref = { enabled: true };

export function loadCardCharmsPref(): CardCharmsPref {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw == null) return DEFAULT_CARD_CHARMS_PREF;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return DEFAULT_CARD_CHARMS_PREF;
    const enabled = (parsed as { enabled?: unknown }).enabled;
    if (typeof enabled !== 'boolean') return DEFAULT_CARD_CHARMS_PREF;
    return { enabled };
  } catch {
    return DEFAULT_CARD_CHARMS_PREF;
  }
}

export function saveCardCharmsPref(pref: CardCharmsPref): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pref));
  } catch {
    /* quota / private mode */
  }
}
