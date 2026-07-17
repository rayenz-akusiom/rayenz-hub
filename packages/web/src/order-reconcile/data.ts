import { bridgeAvailable, sleep } from '../lib/hub-utils';
import { fetchPrintings as scryfallFetchPrintings } from '../lib/scryfall-cache';
import { ArchidektExport } from '../mtg/archidekt-export';
import { OrderReconcileExport } from '../mtg/order-reconcile-export';
import { buildAssignmentIndex } from './assign';
import { sortDecksByName } from './helpers';
import type { OrderReconcileDeck, OrderReconcileSettingsPayload, OrderReconcileState, PrintingParts } from './types';
import { STAGING_DECK_ID } from './types';

type ArchidektBridge = {
  fetchFolder?: (folderId: number) => Promise<OrderReconcileDeck[]>;
  fetchDeckSnapshot?: (deckId: number) => Promise<unknown>;
};

function bridge(): ArchidektBridge | undefined {
  return (window as Window & { RayenzArchidektBridge?: ArchidektBridge }).RayenzArchidektBridge;
}

export function parseFolderId(url: string | null | undefined): number | null {
  const match = String(url || '').match(/archidekt\.com\/folders\/(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

export async function loadDeckRegistry(settings: OrderReconcileSettingsPayload): Promise<OrderReconcileDeck[]> {
  const source = settings.registrySource || 'folder';
  if (source === 'urls') {
    const urls = (settings.customDeckUrls || '').split(/\r?\n/).filter(Boolean);
    return urls.map((url, i) => ({
      deck_id: 'custom-' + i,
      deck_name: 'Deck ' + (i + 1),
      archidekt_url: url.trim(),
    }));
  }
  if (!bridgeAvailable() || typeof bridge()?.fetchFolder !== 'function') {
    throw new Error('Install Archidekt Deck Review Bridge userscript (2026-06-25-2+) for folder fetch.');
  }
  const folderId = parseFolderId(settings.folderUrl);
  if (!folderId) {
    throw new Error('Invalid Archidekt folder URL.');
  }
  return (await bridge()!.fetchFolder!(folderId)) as OrderReconcileDeck[];
}

export async function fetchDeckSnapshot(url: string): Promise<unknown> {
  if (!bridgeAvailable()) {
    throw new Error('Install Archidekt Deck Review Bridge userscript for live Archidekt fetch.');
  }
  const deckId = ArchidektExport.parseDeckId(url);
  if (!deckId) {
    throw new Error('Invalid Archidekt URL: ' + url);
  }
  return bridge()!.fetchDeckSnapshot!(deckId);
}

export type FetchProgressCallbacks = {
  onProgress: (current: number, total: number, msg: string) => void;
  onStatus: (msg: string) => void;
  onFinish: (label: string, variant?: string) => void;
};

export async function fetchAllSnapshots(
  state: OrderReconcileState,
  callbacks: FetchProgressCallbacks,
): Promise<Pick<OrderReconcileState, 'decks' | 'stagingDeck' | 'assignmentIndex'>> {
  try {
    const decks = sortDecksByName(await loadDeckRegistry(state.settings));
    const total = decks.length + 1;
    let step = 0;
    callbacks.onProgress(step, total, 'Fetching staging deck…');
    const stagingDeck: OrderReconcileDeck = {
      deck_id: STAGING_DECK_ID,
      deck_name: 'Buy / trade list',
      archidekt_url: state.settings.stagingDeckUrl,
      deck_snapshot: (await fetchDeckSnapshot(state.settings.stagingDeckUrl || '')) as OrderReconcileDeck['deck_snapshot'],
    };
    step = 1;
    callbacks.onProgress(step, total, 'Fetched staging deck');
    for (let i = 0; i < decks.length; i++) {
      step = i + 2;
      callbacks.onProgress(
        step,
        total,
        'Fetching deck ' + (i + 1) + '/' + decks.length + ': ' + decks[i].deck_name + '…',
      );
      decks[i].deck_snapshot = (await fetchDeckSnapshot(decks[i].archidekt_url || '')) as OrderReconcileDeck['deck_snapshot'];
      if (i < decks.length - 1) {
        await sleep(150);
      }
    }
    const assignmentIndex = buildAssignmentIndex(decks);
    const label = 'Fetched ' + decks.length + ' decks + staging list.';
    callbacks.onStatus(label);
    callbacks.onFinish(label);
    return { decks, stagingDeck, assignmentIndex };
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
