import {
  applyFormalSwapsToCards,
  applyLookingForToCards,
  getOracle,
  isTheoryDeck,
  type DeckDocument,
} from '@rayenz-hub/shared';
import { fetchPrintings as scryfallFetchPrintings } from '../lib/scryfall-cache';
import { listFallbackLibrary, pullRemoteLibraryUpdates, resolveLibraryDocument } from '../deck-builder/store/library-sync';
import { OrderReconcileExport } from '../mtg/order-reconcile-export';
import { buildAssignmentIndex } from './assign';
import { sortDecksByName } from './helpers';
import type { OrderReconcileDeck, OrderReconcileState, PrintingParts } from './types';

export type FetchProgressCallbacks = {
  onProgress: (current: number, total: number, msg: string) => void;
  onStatus: (msg: string) => void;
  onFinish: (label: string, variant?: string) => void;
};

/** Same projection as shared `hubDeckToRecord` (export-style Queued In/Out + Seeking). */
function hubDeckToReconcileDeck(doc: DeckDocument): OrderReconcileDeck {
  let cards = applyFormalSwapsToCards(doc.cards || [], doc.formalSwapEntries || [], doc.format);
  cards = applyLookingForToCards(cards, doc.lookingForEntries || [], doc.format);
  return {
    deck_id: doc.deckId,
    deck_name: doc.name,
    archidekt_url: doc.archidektUrl || '',
    format: doc.format,
    deck_snapshot: {
      cards: cards.map((c) => {
        const oracle = getOracle(doc, c);
        const categories = [c.primaryCategory, ...(c.categories || []).filter((x) => x !== c.primaryCategory)];
        return {
          name: c.name,
          set_code: c.setCode,
          collector_number: c.collectorNumber,
          quantity: c.quantity,
          primary_category: c.primaryCategory,
          categories,
          color_identity: oracle?.colourIdentity || [],
        };
      }),
    },
  };
}

export async function loadHubLibraryDecksForReconcile(): Promise<OrderReconcileDeck[]> {
  let summaries;
  try {
    summaries = await pullRemoteLibraryUpdates();
  } catch {
    summaries = await listFallbackLibrary();
  }
  const decks: OrderReconcileDeck[] = [];
  for (const s of summaries) {
    if (s.format !== 'commander' && s.format !== 'cube' && s.format !== 'pendragon') continue;
    if (isTheoryDeck(s)) continue;
    const doc = await resolveLibraryDocument(s.deckId);
    if (!doc || isTheoryDeck(doc)) continue;
    decks.push(hubDeckToReconcileDeck(doc));
  }
  return sortDecksByName(decks);
}

export async function loadHubLibrarySnapshots(
  _state: OrderReconcileState,
  callbacks: FetchProgressCallbacks,
): Promise<Pick<OrderReconcileState, 'decks' | 'assignmentIndex'>> {
  try {
    callbacks.onProgress(0, 1, 'Loading Hub library…');
    const decks = await loadHubLibraryDecksForReconcile();
    callbacks.onProgress(1, 1, 'Loaded ' + decks.length + ' decks');
    const assignmentIndex = buildAssignmentIndex(decks);
    const label =
      decks.length === 0
        ? 'No commander or cube decks in the Hub library.'
        : 'Loaded ' + decks.length + ' Hub decks.';
    callbacks.onStatus(label);
    callbacks.onFinish(label);
    return { decks, assignmentIndex };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    callbacks.onFinish(msg, 'error');
    throw err;
  }
}

export async function validateScryfallName(name: string): Promise<boolean> {
  const url = 'https://api.scryfall.com/cards/named?exact=' + encodeURIComponent(name);
  const resp = await fetch(url);
  return resp.ok;
}

export async function fetchColorIdentity(
  cardName: string,
  cache: Record<string, string[]>,
): Promise<{ ci: string[]; cache: Record<string, string[]> }> {
  if (!cardName) {
    return { ci: [], cache };
  }
  const cacheKey = cardName.toLowerCase();
  if (cache[cacheKey]) {
    return { ci: cache[cacheKey], cache };
  }
  try {
    const url = 'https://api.scryfall.com/cards/named?exact=' + encodeURIComponent(cardName);
    const resp = await fetch(url);
    if (!resp.ok) {
      return { ci: [], cache };
    }
    const json = (await resp.json()) as { color_identity?: string[] };
    const ci = json.color_identity || [];
    return { ci, cache: { ...cache, [cacheKey]: ci } };
  } catch {
    return { ci: [], cache };
  }
}

export async function resolveCubeDestinationForCard(
  deck: OrderReconcileDeck | null | undefined,
  cardName: string,
  colorIdentityCache: Record<string, string[]>,
): Promise<{ category: string; colorIdentityCache: Record<string, string[]> }> {
  if (!deck?.deck_snapshot || !cardName) {
    return { category: '', colorIdentityCache };
  }
  const snapshot = deck.deck_snapshot;
  let matched: { color_identity?: string[] } | null = null;
  for (const card of snapshot.cards || []) {
    if (matched) break;
    if (OrderReconcileExport.namesMatch(cardName, card.name || '') && card.color_identity) {
      matched = card;
    }
  }
  if (matched?.color_identity?.length) {
    return {
      category: OrderReconcileExport.resolveCubeDestinationCategory(snapshot, matched.color_identity),
      colorIdentityCache,
    };
  }
  const { ci, cache } = await fetchColorIdentity(cardName, colorIdentityCache);
  return {
    category: OrderReconcileExport.resolveCubeDestinationCategory(snapshot, ci),
    colorIdentityCache: cache,
  };
}

export async function fetchPrintings(cardName: string): Promise<
  {
    id: string;
    name: string;
    set: string;
    set_name?: string;
    collector_number: string;
    layout?: string;
    finishes?: string[];
  }[]
> {
  return (await scryfallFetchPrintings(cardName)) as {
    id: string;
    name: string;
    set: string;
    set_name?: string;
    collector_number: string;
    layout?: string;
    finishes?: string[];
  }[];
}

export function printOptionLines(p: { set_name?: string; set?: string; collector_number?: string; name?: string }): string[] {
  const lines: string[] = [];
  if (p.set_name || p.set) {
    lines.push((p.set_name || p.set || '').toUpperCase() + (p.collector_number ? ' #' + p.collector_number : ''));
  }
  return lines.length ? lines : [p.name || ''];
}

export function printingValueFromParts(parts: PrintingParts): string {
  return JSON.stringify({
    name: parts.name,
    set_code: parts.set_code,
    collector_number: parts.collector_number,
    finish: parts.finish || 'nonfoil',
    scryfall_id: parts.scryfall_id,
  });
}

export function readPrintingValue(raw: string | null | undefined): PrintingParts | null {
  try {
    return raw ? (JSON.parse(raw) as PrintingParts) : null;
  } catch {
    return null;
  }
}
