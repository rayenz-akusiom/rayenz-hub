import { saveReviewHandoff } from '../lib/hub-storage';
import { bridgeAvailable } from '../lib/hub-utils';
import { navigateHub } from '../lib/hub-storage';
import {
  attachProfileLists,
  enrichDeckWithProfile,
  fetchDeckSnapshot,
  resolveDeckEligibility,
} from './data';
import { buildExport } from './export';
import { getGenerateReadiness, rulesDebugEnabled } from './readiness';
import { runRulesForDeck } from './rules';
import type { DeckRecord, DeckResult, DeckSuggestState, GenerationRun, SetScope } from './types';

export async function runGenerationForDeck(
  deck: DeckRecord,
  setScope: SetScope,
  debug: boolean,
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
  deck.format = eligibility.format || 'commander';
  const output = runRulesForDeck(deck, setScope, { debug });
  return {
    deck,
    skipped: false,
    suggestions: output.suggestions,
    audit: output.audit,
    analysis: output.analysis,
    taggerCoverage: output.taggerCoverage,
    debugTrace: output.debugTrace,
  };
}

export async function generateSuggestions(
  state: DeckSuggestState,
  onProgress?: (update: { current?: number; total?: number; label?: string }) => void,
): Promise<GenerationRun> {
  const readiness = getGenerateReadiness(state);
  if (!readiness.ok) {
    throw new Error('Complete setup requirements before generating.');
  }
  if (!state.setScope) {
    throw new Error('Load a set pool first.');
  }
  const selected = state.deckSelection.decks.filter(
    (d) => state.deckSelection.selectedIds.indexOf(d.deck_id) >= 0,
  );
  if (!selected.length) {
    throw new Error('Select at least one deck.');
  }

  const debug = rulesDebugEnabled(state.settings);
  const deckResults: DeckResult[] = [];
  const allAudit: Array<Record<string, unknown>> = [];

  for (let i = 0; i < selected.length; i += 1) {
    const deck = selected[i];
    onProgress?.({
      current: i + 1,
      total: selected.length,
      label: 'Generating ' + (i + 1) + '/' + selected.length + ': ' + deck.deck_name + '…',
    });
    try {
      if (!deck.deck_snapshot) {
        deck.deck_snapshot = await fetchDeckSnapshot(deck.archidekt_url || '');
      }
      const result = await runGenerationForDeck(deck, state.setScope, debug);
      deckResults.push(result);
      (result.audit || []).forEach((a) => {
        allAudit.push(a);
      });
    } catch (err) {
      deckResults.push({
        deck,
        error: err instanceof Error ? err.message : String(err),
        suggestions: [],
        audit: [],
      });
    }
  }

  return {
    runId: new Date().toISOString(),
    rulesExecuted: allAudit,
    taggerCoverage: deckResults[0]?.taggerCoverage,
    deckResults,
  };
}

async function ensureHandoffSnapshots(
  payload: ReturnType<typeof buildExport>,
  generationRun: GenerationRun | null,
): Promise<void> {
  const reviewable = (payload.decks || []).filter((d) => (d.suggestions || []).length > 0);
  for (let i = 0; i < reviewable.length; i += 1) {
    const exported = reviewable[i];
    if (exported.deck_snapshot && exported.deck_snapshot.cards && exported.deck_snapshot.cards.length) {
      continue;
    }
    let source: DeckRecord | undefined;
    if (generationRun) {
      for (const result of generationRun.deckResults || []) {
        if (result.deck && result.deck.deck_id === exported.deck_id) {
          source = result.deck;
          break;
        }
      }
    }
    if (source?.deck_snapshot?.cards?.length) {
      exported.deck_snapshot = source.deck_snapshot as typeof exported.deck_snapshot;
      continue;
    }
    if (bridgeAvailable() && exported.archidekt_url) {
      exported.deck_snapshot = (await fetchDeckSnapshot(exported.archidekt_url)) as typeof exported.deck_snapshot;
      if (source) {
        source.deck_snapshot = exported.deck_snapshot as DeckRecord['deck_snapshot'];
      }
      continue;
    }
    throw new Error(
      'Missing deck snapshot for ' +
        (exported.deck_name || exported.deck_id) +
        '. Load decks with the Archidekt bridge or upload deck JSON with a snapshot.',
    );
  }
}

export async function transferToDeckReview(state: DeckSuggestState): Promise<void> {
  const payload = buildExport(state);
  const hasSuggestions = (payload.decks || []).some((d) => (d.suggestions || []).length > 0);
  if (!hasSuggestions) {
    throw new Error('No suggestions to review — adjust inputs or deck profile and generate again.');
  }
  await ensureHandoffSnapshots(payload, state.generationRun);
  const handoffPayload = {
    data: payload,
    source: 'deck-suggest',
    savedAt: new Date().toISOString(),
  };
  if (!saveReviewHandoff(handoffPayload)) {
    throw new Error('Could not store handoff. Use Download JSON and upload in Deck Review instead.');
  }
  navigateHub('#/deck-review');
}

export async function loadFolderDecks(
  folderUrl: string,
  loadRegistry: (url: string) => Promise<DeckRecord[]>,
): Promise<DeckRecord[]> {
  return loadRegistry(folderUrl);
}

export function restoreSetPoolFromSettings(
  setCodesInput: string,
  tryRestore: (codesKey: string) => SetScope | null,
  normalizeKey: (codes: string[]) => string,
  normalizeCodes: (input: string) => string[],
): SetScope | null {
  const codes = normalizeCodes(setCodesInput);
  if (!codes.length) {
    return null;
  }
  const codesKey = normalizeKey(codes);
  const scope = tryRestore(codesKey);
  if (scope) {
    scope.fromCache = true;
    return scope;
  }
  return null;
}
