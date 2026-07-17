import type { DeckEntry, Suggestion } from '@rayenz-hub/shared';
import { ArchidektExport } from '../mtg/archidekt-export';
import type { ReviewProgress } from '../lib/hub-storage';
import {
  findSnapshotCard,
  isMissingSuggestedCut,
  needsSuggestedCut,
  printingToCardIn,
} from './data';
import type { AcceptedSwap, CardOutSelection, ReviewDecision, ScryfallPrint } from './types';

export function decisionKey(suggestionId: string): string {
  return suggestionId;
}

export function getDecision(
  progress: ReviewProgress,
  suggestionId: string,
): ReviewDecision | null {
  const raw = progress.decisions[decisionKey(suggestionId)];
  return (raw as ReviewDecision) || null;
}

export function decisionStatusClass(status: string): string {
  if (status === 'accepted') return ' dr-decision-accepted';
  if (status === 'rejected') return ' dr-decision-rejected';
  if (status === 'skipped') return ' dr-decision-skipped';
  return '';
}

export function decisionStatusLabel(status: string): string {
  if (status === 'accepted') {
    return '<span class="dr-decision-label dr-decision-label-accepted">Accepted</span>';
  }
  if (status === 'rejected') {
    return '<span class="dr-decision-label dr-decision-label-rejected">Rejected</span>';
  }
  if (status === 'skipped') {
    return '<span class="dr-decision-label dr-decision-label-skipped">Skipped</span>';
  }
  if (status === 'pending') {
    return '<span class="dr-decision-label dr-decision-label-pending">Pending</span>';
  }
  return '';
}

export function decisionStatusText(status: string): string {
  if (status === 'accepted') return 'Accepted';
  if (status === 'rejected') return 'Rejected';
  if (status === 'skipped') return 'Skipped';
  if (status === 'pending') return 'Pending';
  return '';
}

export function decisionRecapInOut(
  suggestion: Suggestion,
  decision: ReviewDecision | null,
): { inName: string; inSet: string; outName: string } {
  let inName = '';
  let inSet = '';
  let outName = '';
  if (decision?.status === 'accepted' && decision.accepted) {
    if (decision.accepted.card_in) {
      inName = decision.accepted.card_in.name || '';
      inSet = decision.accepted.card_in.set_code || '';
    }
    if (decision.accepted.card_out?.name) {
      outName = decision.accepted.card_out.name;
    }
  } else {
    const card = suggestion.card as { name?: string; set_code?: string } | undefined;
    inName = card?.name || '';
    inSet = card?.set_code || '';
    const rep = (suggestion.replaces || [])[0] as { name?: string } | undefined;
    outName = rep?.name || '';
  }
  return { inName, inSet, outName };
}

export function acceptedForDeck(
  deck: DeckEntry,
  progress: ReviewProgress,
): AcceptedSwap[] {
  const out: AcceptedSwap[] = [];
  (deck.suggestions || []).forEach((s) => {
    const d = getDecision(progress, String(s.suggestion_id));
    if (d?.status === 'accepted' && d.accepted) {
      out.push(d.accepted);
    }
  });
  return out;
}

export function allAcceptedByDeck(
  decks: DeckEntry[],
  progress: ReviewProgress,
): Record<string, AcceptedSwap[]> {
  const map: Record<string, AcceptedSwap[]> = {};
  decks.forEach((deck) => {
    const items = acceptedForDeck(deck, progress);
    if (items.length && deck.deck_id) {
      map[deck.deck_id] = items;
    }
  });
  return map;
}

export type AcceptSelections = {
  printId: string;
  finish: string;
  prints: ScryfallPrint[];
  cutMeta: CardOutSelection;
};

export function buildAcceptedSwap(
  deck: DeckEntry,
  suggestion: Suggestion,
  selections: AcceptSelections,
): AcceptedSwap | { error: string } {
  const card = suggestion.card as {
    name: string;
    set_code?: string;
    collector_number?: string;
    scryfall_id?: string;
    scryfall_uri?: string;
  };
  const print =
    selections.prints.find((p) => p.id === selections.printId) ||
    (card as unknown as ScryfallPrint);
  const cardIn = printingToCardIn(print, card, selections.finish);
  const cutMeta = { ...selections.cutMeta };

  if (isMissingSuggestedCut(suggestion) && !cutMeta.name) {
    return {
      error: 'No Out card selected. This suggestion had no cut in the JSON — pick one manually or skip.',
    };
  }
  if (!cutMeta.name && needsSuggestedCut(suggestion)) {
    return { error: 'Select an Out card before accepting.' };
  }
  if (!cutMeta.set_code || !cutMeta.collector_number) {
    const snap = findSnapshotCard(deck, cutMeta.name, cutMeta.set_code, cutMeta.collector_number);
    if (snap) {
      cutMeta.set_code = cutMeta.set_code || snap.set_code || null;
      cutMeta.collector_number = cutMeta.collector_number || snap.collector_number || null;
    }
  }

  return {
    suggestion_id: String(suggestion.suggestion_id),
    deck_id: deck.deck_id || '',
    archidekt_deck_id: ArchidektExport.parseDeckId(deck.archidekt_url),
    archidekt_url: deck.archidekt_url,
    action: suggestion.action as string | undefined,
    quantity: 1,
    card_in: cardIn,
    card_out: {
      name: cutMeta.name,
      quantity: 1,
      set_code: cutMeta.set_code,
      collector_number: cutMeta.collector_number,
    },
    swap_categories:
      suggestion.action === 'replace' ||
      suggestion.priority_tier === 'swap' ||
      !!cutMeta.name,
  };
}
