import {
  deckOwnership,
  type DeckOwnership,
  type DeckSummary,
} from '../schemas/deck-builder.js';

export function filterLibraryByFormat(
  summaries: DeckSummary[],
  format: 'commander' | 'cube',
): DeckSummary[] {
  return summaries.filter((s) => s.format === format);
}

/** Partition library summaries into Owned then Theory (for swimlanes). */
export function partitionLibraryByOwnership(summaries: DeckSummary[]): {
  owned: DeckSummary[];
  theory: DeckSummary[];
} {
  const owned: DeckSummary[] = [];
  const theory: DeckSummary[] = [];
  for (const s of summaries || []) {
    if (deckOwnership(s) === 'theory') theory.push(s);
    else owned.push(s);
  }
  return { owned, theory };
}

export function ownershipLabel(ownership: DeckOwnership): string {
  return ownership === 'theory' ? 'Theory' : 'Owned';
}
