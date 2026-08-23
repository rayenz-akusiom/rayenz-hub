const STORAGE_KEY = 'rayenz-scryfall-quick-add';

export type ScryfallQuickAddPref =
  | { kind: 'off' }
  | { kind: 'default' }
  | { kind: 'maybeboard' }
  | { kind: 'category'; name: string };

export const DEFAULT_SCRYFALL_QUICK_ADD_PREF: ScryfallQuickAddPref = { kind: 'default' };

export function parseScryfallQuickAddPref(raw: unknown): ScryfallQuickAddPref {
  if (!raw || typeof raw !== 'object') return DEFAULT_SCRYFALL_QUICK_ADD_PREF;
  const kind = (raw as { kind?: unknown }).kind;
  if (kind === 'off' || kind === 'default' || kind === 'maybeboard') {
    return { kind };
  }
  if (kind === 'category') {
    const name = String((raw as { name?: unknown }).name || '').trim();
    if (name) return { kind: 'category', name };
  }
  return DEFAULT_SCRYFALL_QUICK_ADD_PREF;
}

export function loadScryfallQuickAddPref(): ScryfallQuickAddPref {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw == null) return DEFAULT_SCRYFALL_QUICK_ADD_PREF;
    return parseScryfallQuickAddPref(JSON.parse(raw));
  } catch {
    return DEFAULT_SCRYFALL_QUICK_ADD_PREF;
  }
}

export function saveScryfallQuickAddPref(pref: ScryfallQuickAddPref): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pref));
  } catch {
    /* quota / private mode */
  }
}

export function scryfallQuickAddMenuValue(pref: ScryfallQuickAddPref): string {
  switch (pref.kind) {
    case 'off':
      return 'Off';
    case 'default':
      return 'Default';
    case 'maybeboard':
      return 'Maybeboard';
    case 'category':
      return pref.name;
  }
}
