import { normalizeSetCodesKey } from '../lib/hub-storage';
import type { DeckSuggestState, ReadinessResult } from './types';

export function normalizeCodesInput(input: string | null | undefined): string[] {
  return String(input || '')
    .split(/[,\s]+/)
    .filter(Boolean)
    .map((c) => String(c).trim().toUpperCase());
}

export function getGenerateReadiness(st?: Partial<DeckSuggestState>): ReadinessResult {
  const state = st || {};
  const items: ReadinessResult['items'] = [];
  const missing: string[] = [];
  const codesInput =
    state.ui?.setCodesInput != null ? state.ui.setCodesInput : state.settings?.setCodes || '';
  const inputCodes = normalizeCodesInput(codesInput);
  const inputKey = normalizeSetCodesKey(inputCodes);

  if (state.setScope && state.setScope.complete === true) {
    const scopeKey = state.setScope.codesKey || normalizeSetCodesKey(state.setScope.codes);
    const codesMatch = scopeKey === inputKey;
    const cacheLabel =
      state.setScope.source === 'scryfall' && state.setScope.fromCache ? ' (cached)' : '';
    if (codesMatch) {
      items.push({
        id: 'set',
        ok: true,
        label: 'Set pool loaded — ' + state.setScope.cards.length + ' cards' + cacheLabel,
      });
    } else {
      missing.push('set');
      items.push({
        id: 'set',
        ok: false,
        label: 'Set codes changed — reload set pool',
      });
    }
  } else {
    missing.push('set');
    items.push({ id: 'set', ok: false, label: 'Load set pool' });
  }

  if ((state.deckSelection?.decks || []).length > 0) {
    items.push({
      id: 'decks',
      ok: true,
      label: state.deckSelection!.decks.length + ' deck(s) available',
    });
  } else {
    missing.push('decks');
    items.push({ id: 'decks', ok: false, label: 'Load decks or paste a deck import' });
  }

  const selectedCount = (state.deckSelection?.selectedIds || []).length;
  if (selectedCount > 0) {
    items.push({
      id: 'selection',
      ok: true,
      label: selectedCount + ' deck(s) selected',
    });
  } else {
    missing.push('selection');
    items.push({ id: 'selection', ok: false, label: 'Select at least one deck' });
  }

  const ok = !missing.length && !state.generating;
  return { ok, missing, items, generating: !!state.generating };
}

export function rulesDebugEnabled(
  settings: { rulesDebug?: boolean },
  isLocal: () => boolean = () => {
    try {
      const host = window.location?.hostname;
      return host === 'localhost' || host === '127.0.0.1';
    } catch {
      return false;
    }
  },
): boolean {
  return isLocal() && !!settings.rulesDebug;
}
