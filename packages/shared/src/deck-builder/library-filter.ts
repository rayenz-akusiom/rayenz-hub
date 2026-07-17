import type { DeckSummary } from '../schemas/deck-builder.js';

export function filterLibraryByFormat(
  summaries: DeckSummary[],
  format: 'commander' | 'cube',
): DeckSummary[] {
  return summaries.filter((s) => s.format === format);
}
