import { isApiConfigured } from '../api/hub-api';
import { isSignedIn } from '../lib/hub-auth-session';
import { MANUAL_SET_CODES_MAX, FOCUS_TAGS_MAX } from '@rayenz-hub/shared';
import type { DeckSuggestState, ReadinessResult } from './types';
import { pageIsOverCap } from './paging';
import { parseReleaseId } from './releases';

export function normalizeCodesInput(input: string | null | undefined): string[] {
  return String(input || '')
    .split(/[,\s]+/)
    .filter(Boolean)
    .map((c) => String(c).trim().toUpperCase());
}

export function parseBudgetUsd(input: string | null | undefined): number | null {
  const n = Number.parseFloat(String(input || '').trim());
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export function getGenerateReadiness(st?: Partial<DeckSuggestState>): ReadinessResult {
  const state = st || {};
  const items: ReadinessResult['items'] = [];
  const missing: string[] = [];
  const mode = state.ui?.setInputMode || state.settings?.setInputMode || 'release';
  const releaseId =
    String(state.ui?.releaseId || '').trim() || String(state.settings?.releaseId || '').trim();
  const codesInput =
    state.ui?.setCodesInput != null && String(state.ui.setCodesInput).trim() !== ''
      ? state.ui.setCodesInput
      : state.settings?.setCodes || '';
  const inputCodes = normalizeCodesInput(codesInput);
  const budgetInput =
    state.ui?.budgetUsdInput != null && String(state.ui.budgetUsdInput).trim() !== ''
      ? state.ui.budgetUsdInput
      : state.settings?.budgetUsd != null
        ? String(state.settings.budgetUsd)
        : '';
  const budgetUsd = parseBudgetUsd(budgetInput);

  if (mode === 'budget') {
    if (budgetUsd != null) {
      items.push({ id: 'set', ok: true, label: `Budget $${budgetUsd}` });
    } else {
      missing.push('set');
      items.push({ id: 'set', ok: false, label: 'Enter a positive budget (USD)' });
    }
  } else if (mode === 'release') {
    if (parseReleaseId(releaseId)) {
      items.push({ id: 'set', ok: true, label: 'Release selected' });
    } else {
      missing.push('set');
      items.push({ id: 'set', ok: false, label: 'Select a set release' });
    }
  } else if (inputCodes.length > 0 && inputCodes.length <= MANUAL_SET_CODES_MAX) {
    items.push({
      id: 'set',
      ok: true,
      label: inputCodes.length + ' set code(s)',
    });
  } else if (inputCodes.length > MANUAL_SET_CODES_MAX) {
    missing.push('set');
    items.push({
      id: 'set',
      ok: false,
      label: `At most ${MANUAL_SET_CODES_MAX} set codes`,
    });
  } else {
    missing.push('set');
    items.push({ id: 'set', ok: false, label: 'Enter 1–5 set codes' });
  }

  if ((state.deckSelection?.decks || []).length > 0) {
    items.push({
      id: 'decks',
      ok: true,
      label: state.deckSelection!.decks.length + ' deck(s) available',
    });
  } else {
    missing.push('decks');
    items.push({ id: 'decks', ok: false, label: 'No decks loaded yet' });
  }

  const selectedCount = (state.deckSelection?.selectedIds || []).length;
  const budgetSingle = mode === 'budget' ? selectedCount === 1 : true;
  if (mode === 'budget' && selectedCount !== 1) {
    missing.push('selection');
    items.push({
      id: 'selection',
      ok: false,
      label: 'Select exactly one deck for Budget upgrade',
    });
  } else if (selectedCount > 0) {
    items.push({
      id: 'selection',
      ok: true,
      label:
        mode === 'budget'
          ? '1 deck selected'
          : selectedCount + ' deck(s) selected',
    });
  } else {
    missing.push('selection');
    items.push({ id: 'selection', ok: false, label: 'Select at least one deck' });
  }

  const focusCount = (state.ui?.focusTags || state.settings?.focusTags || []).length;
  if (focusCount > FOCUS_TAGS_MAX) {
    missing.push('focus');
    items.push({
      id: 'focus',
      ok: false,
      label: `At most ${FOCUS_TAGS_MAX} focus tags`,
    });
  }

  if (isApiConfigured()) {
    items.push({ id: 'api', ok: true, label: 'API configured' });
  } else {
    missing.push('api');
    items.push({
      id: 'api',
      ok: false,
      label: 'Sign in from the left nav',
    });
  }

  if (isSignedIn()) {
    items.push({ id: 'session', ok: true, label: 'Signed in' });
  } else {
    missing.push('session');
    items.push({
      id: 'session',
      ok: false,
      label: 'Sign in from the left nav',
    });
  }

  const cap = state.generationRun?.cap || 20;
  if (mode !== 'budget' && selectedCount > 0 && pageIsOverCap(state.deckSelection?.selectedIds || [], cap)) {
    missing.push('cap');
    items.push({
      id: 'cap',
      ok: false,
      label: `Select at most ${cap} decks`,
    });
  }

  const ok = !missing.length && budgetSingle;
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

/** Short reason for a disabled Generate button. */
export function getGenerateBlockedReason(st?: Partial<DeckSuggestState>): string {
  const readiness = getGenerateReadiness(st);
  if (readiness.ok) return '';
  const first = readiness.items.find((item) => !item.ok);
  return first?.label || 'Complete setup first';
}
