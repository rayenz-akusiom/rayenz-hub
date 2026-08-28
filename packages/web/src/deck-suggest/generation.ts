import { isApiConfigured } from '../api/hub-api';
import { isSignedIn } from '../lib/hub-auth-session';
import { attachProfileLists, enrichDeckWithProfile, resolveDeckEligibility } from './data';
import { getGenerateReadiness, normalizeCodesInput, parseBudgetUsd } from './readiness';
import { apiPostSuggestGenerate } from './generate-api';
import { pageIsOverCap } from './paging';
import { parseReleaseId } from './releases';
import type { DeckRecord, DeckResult, DeckSuggestState, GenerationRun, Suggestion } from './types';

export async function generateSuggestions(
  state: DeckSuggestState,
  onProgress?: (update: { current?: number; total?: number; label?: string }) => void,
  cap = 20,
): Promise<GenerationRun> {
  if (!isApiConfigured()) {
    throw new Error('Sign in from the left nav to generate suggestions.');
  }
  if (!isSignedIn()) {
    throw new Error('Sign in from the left nav to generate suggestions.');
  }
  const readiness = getGenerateReadiness({ ...state, generating: false });
  if (!readiness.ok) {
    throw new Error(readiness.items.find((i) => !i.ok)?.label || 'Complete setup before generating.');
  }
  const mode = state.ui.setInputMode || state.settings.setInputMode || 'release';
  const selected = state.deckSelection.decks.filter(
    (d) => state.deckSelection.selectedIds.indexOf(d.deck_id) >= 0,
  );
  if (!selected.length) {
    throw new Error('Select at least one deck.');
  }
  if (mode !== 'budget' && pageIsOverCap(state.deckSelection.selectedIds, cap)) {
    throw new Error(`Select at most ${cap} decks before generating.`);
  }
  if (mode === 'budget' && selected.length !== 1) {
    throw new Error('Select exactly one deck for Budget upgrade.');
  }

  onProgress?.({ label: 'Generating…', current: 1, total: 1 });
  const releaseId = String(state.ui.releaseId || state.settings.releaseId || '').trim();
  const parsedRelease = mode === 'release' ? parseReleaseId(releaseId) : null;
  if (mode === 'release' && !parsedRelease) {
    throw new Error('Select a set release.');
  }

  const budgetInput =
    state.ui.budgetUsdInput?.trim() ||
    (state.settings.budgetUsd != null ? String(state.settings.budgetUsd) : '');
  const budgetUsd = mode === 'budget' ? parseBudgetUsd(budgetInput) : null;
  if (mode === 'budget' && budgetUsd == null) {
    throw new Error('Enter a positive budget (USD).');
  }

  const focusTags = (state.ui.focusTags || state.settings.focusTags || []).slice(0, 5);

  const body =
    mode === 'budget' && budgetUsd != null
      ? {
          budgetUsd,
          deckIds: selected.map((d) => d.deck_id),
          focusTags: focusTags.length ? focusTags : undefined,
          maxSwaps: state.settings.maxSwaps,
          excludeOwned: state.settings.excludeOwned,
        }
      : mode === 'release' && parsedRelease
        ? {
            release: parsedRelease,
            deckIds: selected.map((d) => d.deck_id),
            focusTags: focusTags.length ? focusTags : undefined,
          }
        : {
            setCodes: normalizeCodesInput(state.ui.setCodesInput || state.settings.setCodes),
            deckIds: selected.map((d) => d.deck_id),
            focusTags: focusTags.length ? focusTags : undefined,
          };

  const response = await apiPostSuggestGenerate(body);

  const byId = new Map(selected.map((d) => [d.deck_id, d]));
  const deckResults: DeckResult[] = response.deckResults.map((r) => {
    const deck = byId.get(r.deckId) || { deck_id: r.deckId, deck_name: r.deckName };
    return {
      deck,
      skipped: r.skipped,
      skip_reason: r.skipReason,
      message: r.message,
      suggestions: r.suggestions as Suggestion[],
      audit: r.audit,
      packages: r.packages,
      packaging: r.packaging,
      taggerCoverage: response.taggerCoverage,
    };
  });

  return {
    runId: 'api-' + Date.now(),
    rulesExecuted: deckResults.flatMap((r) => r.audit || []),
    taggerCoverage: response.taggerCoverage,
    deckResults,
    cap: response.cap,
    setCodes: response.setCodes,
    setCodesKey: response.setCodesKey,
    mode: response.mode,
    upgradePoolKey: response.upgradePoolKey,
    focusTags: response.focusTags,
  };
}

export async function runGenerationForDeck(
  deck: DeckRecord,
  _setScope: DeckSuggestState['setScope'],
  _debug: boolean,
): Promise<DeckResult> {
  await enrichDeckWithProfile(deck);
  attachProfileLists(deck);
  const eligibility = deck.eligibility || resolveDeckEligibility(deck);
  if (!eligibility.eligible) {
    return {
      deck,
      skipped: true,
      skip_reason: eligibility.reason,
      message: eligibility.message,
      suggestions: [],
      audit: [],
      analysis: null,
    };
  }
  throw new Error('Use Generate to run suggestions.');
}
