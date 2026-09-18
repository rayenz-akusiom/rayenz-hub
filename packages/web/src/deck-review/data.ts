import { getSwapQueue, normalizeReplaces, replaceEntryName, type DeckEntry, type Suggestion } from '@rayenz-hub/shared';
import { optionKey, scryfallImageFromPrinting } from '@rayenz-hub/shared';
import { fetchPrintings } from '../lib/scryfall-cache';
import type { CutOption, ScryfallPrint } from './types';

export { getSwapQueue as deriveSwapQueue };

function swapQueueHasName(cards: Array<{ name?: string }> | null | undefined, name: string): boolean {
  return (cards || []).some((c) => c.name === name);
}

function replaceNames(suggestion: Suggestion): string[] {
  return normalizeReplaces(suggestion.replaces).map((r) => r.name);
}

export function formatSwapQueueItem(card: { name: string; set_code?: string; collector_number?: string }): string {
  if (card.set_code && card.collector_number) {
    return card.name + ' (' + String(card.set_code).toUpperCase() + ' #' + card.collector_number + ')';
  }
  return card.name;
}

export function getSuggestionStaleness(
  deck: DeckEntry,
  suggestion: Suggestion,
): { stale: boolean; level: string; reasons: string[] } {
  const queue = getSwapQueue(deck);
  if (!queue) {
    return { stale: false, level: '', reasons: [] };
  }
  const reasons: string[] = [];
  const card = suggestion.card as { name?: string } | undefined;
  const incoming = card?.name;
  const slot = suggestion.fills_swap_slot as string | undefined;
  const queuedIn =
    (incoming && swapQueueHasName(queue.new_set_in, incoming)) ||
    (slot && swapQueueHasName(queue.new_set_in, slot));
  const replaces = replaceNames(suggestion);
  const queuedOut = replaces.some((name) => swapQueueHasName(queue.new_set_out, name));
  if (queuedIn) {
    reasons.push((slot || incoming) + ' is already in your Hub Queued In queue.');
  }
  if (queuedOut) {
    replaces.forEach((name) => {
      if (swapQueueHasName(queue.new_set_out, name)) {
        reasons.push(name + ' is already in your Hub Queued Out queue.');
      }
    });
  }
  let level = '';
  if (queuedIn && queuedOut) {
    level = 'fully_queued';
  } else if (queuedIn) {
    level = 'queued_in';
  } else if (queuedOut) {
    level = 'queued_out';
  }
  return { stale: reasons.length > 0, level, reasons };
}

function suggestionCoversQueueIn(suggestion: Suggestion, inName: string): boolean {
  if (!inName || !suggestion) {
    return false;
  }
  if (suggestion.fills_swap_slot === inName) {
    return true;
  }
  if (suggestion.overrides_queue_in === inName) {
    return true;
  }
  const card = suggestion.card as { name?: string } | undefined;
  return card?.name === inName;
}

function suggestionCoversQueueOut(suggestion: Suggestion, outName: string): boolean {
  if (!outName || !suggestion) {
    return false;
  }
  return replaceNames(suggestion).includes(outName);
}

export function getSwapQueueReconciliation(deck: DeckEntry): {
  uncoveredIn: string[];
  uncoveredOut: string[];
  unpairedIn: string[];
  unpairedOut: string[];
} {
  const queue = getSwapQueue(deck);
  if (!queue) {
    return { uncoveredIn: [], uncoveredOut: [], unpairedIn: [], unpairedOut: [] };
  }
  const suggestions = deck.suggestions || [];
  const uncoveredIn: string[] = [];
  const uncoveredOut: string[] = [];
  (queue.new_set_in || []).forEach((c) => {
    const covered = suggestions.some((s) => suggestionCoversQueueIn(s, c.name));
    if (!covered) {
      uncoveredIn.push(c.name);
    }
  });
  (queue.new_set_out || []).forEach((c) => {
    const covered = suggestions.some((s) => suggestionCoversQueueOut(s, c.name));
    if (!covered) {
      uncoveredOut.push(c.name);
    }
  });
  const unpairedIn: string[] = [];
  const unpairedOut: string[] = [];
  const inLen = queue.new_set_in.length;
  const outLen = queue.new_set_out.length;
  if (inLen > outLen) {
    queue.new_set_in.slice(outLen).forEach((c) => {
      unpairedIn.push(c.name);
    });
  } else if (outLen > inLen) {
    queue.new_set_out.slice(inLen).forEach((c) => {
      unpairedOut.push(c.name);
    });
  }
  return { uncoveredIn, uncoveredOut, unpairedIn, unpairedOut };
}

export function findSnapshotCard(
  deck: DeckEntry,
  name: string,
  setCode?: string | null,
  collectorNumber?: string | null,
): {
  name?: string;
  set_code?: string;
  collector_number?: string;
  primary_category?: string;
} | null {
  if (!deck.deck_snapshot?.cards) {
    return null;
  }
  const matches = deck.deck_snapshot.cards.filter((c) => c.name === name);
  if (!matches.length) {
    return null;
  }
  if (setCode && collectorNumber) {
    const exact = matches.find(
      (c) => c.set_code === setCode && String(c.collector_number) === String(collectorNumber),
    );
    if (exact) {
      return exact;
    }
  }
  return matches[0];
}

export { fetchPrintings };

export function printingLabel(print: ScryfallPrint): string {
  const set = (print.set_name || print.set || '').trim();
  const num = print.collector_number || '';
  const price = print.prices?.usd ? ' $' + print.prices.usd : '';
  return set + ' #' + num + price;
}

export function printingToCardIn(
  print: ScryfallPrint,
  fallback: { name: string; set_code?: string; collector_number?: string; scryfall_id?: string; scryfall_uri?: string },
  finish: string,
): {
  name: string;
  set_code: string;
  collector_number: string;
  scryfall_id?: string;
  scryfall_uri?: string;
  finish: string;
} {
  return {
    name: print.name || fallback.name,
    set_code: (print.set || fallback.set_code || '').toUpperCase(),
    collector_number: String(print.collector_number || fallback.collector_number || ''),
    scryfall_id: print.id || fallback.scryfall_id,
    scryfall_uri: print.scryfall_uri || fallback.scryfall_uri,
    finish,
  };
}

export function printOptionLines(print: ScryfallPrint): string[] {
  const set = (print.set_name || print.set || '').trim();
  const num = print.collector_number || '';
  const price = print.prices?.usd ? '$' + print.prices.usd : '';
  const lines: string[] = [];
  if (set || num) {
    lines.push(set + (num ? ' #' + num : ''));
  }
  if (price) {
    lines.push(price);
  }
  if (!lines.length) {
    lines.push(printingLabel(print));
  }
  return lines;
}

export function optionLabel(opt: { name: string; set_code?: string | null; collector_number?: string | null }): string {
  if (opt.set_code && opt.collector_number) {
    return opt.name + ' (' + opt.set_code + ' #' + opt.collector_number + ')';
  }
  return opt.name;
}

export function cutOptionImageSrc(opt: CutOption, deck: DeckEntry): string {
  if (opt.set_code && opt.collector_number) {
    return scryfallImageFromPrinting(opt.set_code, opt.collector_number) || '';
  }
  const snap = findSnapshotCard(deck, opt.name, opt.set_code, opt.collector_number);
  if (snap?.set_code && snap.collector_number) {
    return scryfallImageFromPrinting(snap.set_code, snap.collector_number) || '';
  }
  return '';
}

export function cutOptionLines(opt: { name: string; set_code?: string | null; collector_number?: string | null }): string[] {
  if (opt.set_code && opt.collector_number) {
    return [opt.name, opt.set_code.toUpperCase() + ' #' + opt.collector_number];
  }
  return [opt.name];
}

export function hasSuggestedCut(suggestion: Suggestion): boolean {
  return replaceNames(suggestion).length > 0;
}

export function needsSuggestedCut(suggestion: Suggestion): boolean {
  return suggestion.action !== 'sideboard';
}

export function isMissingSuggestedCut(suggestion: Suggestion): boolean {
  return needsSuggestedCut(suggestion) && !hasSuggestedCut(suggestion);
}

/** True when this suggestion is intentional add-only (no cut): underfull-deck `action: add`. */
export function isAddOnlySuggestion(suggestion: Suggestion): boolean {
  return suggestion.action === 'add' && !hasSuggestedCut(suggestion);
}

/** Out “Never suggest again” only for the originally suggested cut name. */
export function canNeverSuggestOutCut(suggestion: Suggestion, selectedOutName: string): boolean {
  if (!selectedOutName || !hasSuggestedCut(suggestion)) {
    return false;
  }
  const originalOut = replaceNames(suggestion)[0] || '';
  return !!originalOut && selectedOutName === originalOut;
}

export function defaultOutKeyForSuggestion(
  deck: DeckEntry,
  suggestion: Suggestion,
): { defaultOut: string; defaultOutKey: string } {
  const defaultOut = replaceNames(suggestion)[0] || '';
  if (!defaultOut) {
    return { defaultOut: '', defaultOutKey: '' };
  }
  const defaultSnap = findSnapshotCard(deck, defaultOut);
  return {
    defaultOut,
    defaultOutKey: optionKey({
      name: defaultOut,
      set_code: defaultSnap?.set_code ?? null,
      collector_number: defaultSnap?.collector_number ?? null,
    }),
  };
}

export function resolveDefaultCutKey(deck: DeckEntry, suggestion: Suggestion, cutOptions: CutOption[]): string {
  const outDefaults = defaultOutKeyForSuggestion(deck, suggestion);
  const defaultOut = outDefaults.defaultOut;
  const defaultOutKey = outDefaults.defaultOutKey;
  const missingCut = isMissingSuggestedCut(suggestion);

  if (missingCut) {
    return '';
  }
  if (defaultOutKey) {
    return defaultOutKey;
  }
  if (defaultOut) {
    const snap = findSnapshotCard(deck, defaultOut);
    return optionKey({
      name: defaultOut,
      set_code: snap?.set_code ?? null,
      collector_number: snap?.collector_number ?? null,
    });
  }
  if (cutOptions.length) {
    return optionKey(cutOptions[0]);
  }
  return '';
}
