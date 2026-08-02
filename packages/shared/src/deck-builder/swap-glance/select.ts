import type { WantSource } from '../../mtg/wants-aggregate.js';
import type { BuildSwapGlanceOptions, SwapGlanceRequestItem } from './types.js';

/**
 * Project filtered Swap Queue sources into API request items for the chosen
 * glance mode + Seeking toggle.
 */
export function selectSwapGlanceItems(
  sources: WantSource[],
  options: BuildSwapGlanceOptions,
): SwapGlanceRequestItem[] {
  const { mode, includeSeeking } = options;
  const list = sources || [];

  if (mode === 'in_only') {
    return list
      .filter(
        (s) => s.kind === 'queued_in' || (includeSeeking && s.kind === 'seeking'),
      )
      .map((s) => ({ deckId: s.deckId, kind: s.kind, entryId: s.entryId }));
  }

  // full: one item per formal pair (prefer queued_in kind); Seeking when toggled
  const pairs = new Map<string, SwapGlanceRequestItem>();
  const seeking: SwapGlanceRequestItem[] = [];

  for (const s of list) {
    if (s.kind === 'queued_in' || s.kind === 'queued_out') {
      const key = `${s.deckId}\0${s.entryId}`;
      const prev = pairs.get(key);
      if (!prev || (prev.kind === 'queued_out' && s.kind === 'queued_in')) {
        pairs.set(key, { deckId: s.deckId, kind: s.kind, entryId: s.entryId });
      }
      continue;
    }
    if (includeSeeking && s.kind === 'seeking') {
      seeking.push({ deckId: s.deckId, kind: s.kind, entryId: s.entryId });
    }
  }

  return [...pairs.values(), ...seeking];
}

/** Count of rows that will appear for the given selection options. */
export function countSwapGlanceItems(
  sources: WantSource[],
  options: BuildSwapGlanceOptions,
): number {
  return selectSwapGlanceItems(sources, options).length;
}
