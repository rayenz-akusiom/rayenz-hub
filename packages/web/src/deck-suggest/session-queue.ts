import type { GenerationRun, Suggestion } from './types';

export type ActionableSuggestion = {
  deckId: string;
  suggestion: Suggestion;
};

/**
 * Next suggestion after `afterId` in display order (deckResults, then suggestions),
 * skipping ids in `excludeIds`. Returns null when none remain.
 */
export function nextActionableSuggestion(
  run: GenerationRun | null | undefined,
  excludeIds: Iterable<string>,
  afterId?: string | null,
): ActionableSuggestion | null {
  if (!run?.deckResults?.length) return null;
  const exclude = new Set(excludeIds);
  const flat: ActionableSuggestion[] = [];
  for (const result of run.deckResults) {
    const deckId = result.deck?.deck_id;
    if (!deckId) continue;
    for (const suggestion of result.suggestions || []) {
      flat.push({ deckId, suggestion });
    }
  }
  let start = 0;
  if (afterId) {
    const idx = flat.findIndex((item) => item.suggestion.suggestion_id === afterId);
    if (idx >= 0) start = idx + 1;
  }
  for (let i = start; i < flat.length; i++) {
    if (!exclude.has(flat[i].suggestion.suggestion_id)) {
      return flat[i];
    }
  }
  return null;
}
