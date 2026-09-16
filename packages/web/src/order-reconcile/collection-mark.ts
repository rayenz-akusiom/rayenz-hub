import {
  cardImageUrl,
  changeCardPrinting,
  collectionNeededQuantity,
  collectionOwnedQuantity,
  getOracle,
  isCollectionDeck,
  scryfallImageFromName,
  scryfallImageFromPrinting,
  syncCollectionDeck,
  type CardInstance,
  type DeckDocument,
  type PrintingFields,
} from '@rayenz-hub/shared';
import { printingKeyFromCard } from '../deck-builder/collection/sync-from-decks';
import {
  listFallbackLibrary,
  pullRemoteLibraryUpdates,
  resolveLibraryDocument,
} from '../deck-builder/store/library-sync';
import { saveDualMode } from '../deck-builder/store/deck-dual-mode';
import { OrderReconcileExport } from '../mtg/order-reconcile-export';
import type {
  CardCopy,
  CollectionApplyMode,
  CollectionMarkHit,
  CollectionMarkPlan,
} from './types';

function namesMatch(a: string, b: string): boolean {
  return OrderReconcileExport.namesMatch(a, b);
}

function acquiredIsFoil(finish: string | null | undefined): boolean | null {
  const f = String(finish || '').trim().toLowerCase();
  if (!f) return null;
  if (f === 'nonfoil' || f === 'non-foil') return false;
  if (f === 'foil' || f === 'etched' || f === 'glossy') return true;
  if (f.includes('foil') && !f.includes('non')) return true;
  return null;
}

function copyHasExactPrinting(copy: CardCopy): boolean {
  return Boolean(String(copy.set_code || '').trim() && String(copy.collector_number || '').trim());
}

function setCnEqual(
  aSet: string | null | undefined,
  aCn: string | null | undefined,
  bSet: string | null | undefined,
  bCn: string | null | undefined,
): boolean {
  const as = String(aSet || '').trim().toLowerCase();
  const bs = String(bSet || '').trim().toLowerCase();
  const ac = String(aCn || '').trim().toLowerCase();
  const bc = String(bCn || '').trim().toLowerCase();
  return Boolean(as && bs && ac && bc && as === bs && ac === bc);
}

function foilMatches(copy: CardCopy, card: CardInstance): boolean {
  const want = acquiredIsFoil(copy.finish);
  if (want == null) return true;
  return Boolean(card.foil) === want;
}

function isExactPrintingMatch(copy: CardCopy, card: CardInstance): boolean {
  if (!copyHasExactPrinting(copy)) return false;
  if (!namesMatch(copy.card_name, card.name)) return false;
  if (!setCnEqual(copy.set_code, copy.collector_number, card.setCode, card.collectorNumber)) {
    return false;
  }
  return foilMatches(copy, card);
}

function isReplaceableMatch(copy: CardCopy, card: CardInstance): boolean {
  if (!namesMatch(copy.card_name, card.name)) return false;
  if (isExactPrintingMatch(copy, card)) return false;
  return true;
}

function acquiredImageUrl(copy: CardCopy): string {
  if (copy.set_code && copy.collector_number) {
    return scryfallImageFromPrinting(copy.set_code, copy.collector_number) || '';
  }
  return scryfallImageFromName(copy.card_name) || '';
}

function rowImageUrl(deck: DeckDocument, card: CardInstance): string {
  return cardImageUrl({
    imageUrl: getOracle(deck, card)?.imageUrl,
    scryfallId: card.scryfallId,
    setCode: card.setCode,
    collectorNumber: card.collectorNumber,
    name: card.name,
  });
}

function printingFromAcquired(copy: CardCopy): PrintingFields {
  const foil = acquiredIsFoil(copy.finish) === true;
  return {
    name: copy.card_name,
    scryfallId: '',
    setCode: String(copy.set_code || ''),
    collectorNumber: String(copy.collector_number || ''),
    typeLine: null,
    colourIdentity: [],
    layout: null,
    foil,
    printedName: null,
    flavorName: null,
    manaValue: null,
  };
}

type SoughtRow = {
  deck: DeckDocument;
  card: CardInstance;
  remaining: number;
};

function collectSoughtRows(collections: DeckDocument[]): SoughtRow[] {
  const rows: SoughtRow[] = [];
  for (const deck of collections) {
    if (!isCollectionDeck(deck)) continue;
    for (const card of deck.cards || []) {
      const needed = collectionNeededQuantity(card);
      if (needed <= 0) continue;
      rows.push({ deck, card, remaining: needed });
    }
  }
  rows.sort((a, b) => {
    const byDeck = (a.deck.name || '').localeCompare(b.deck.name || '', undefined, { sensitivity: 'base' });
    if (byDeck !== 0) return byDeck;
    return (a.card.name || '').localeCompare(b.card.name || '', undefined, { sensitivity: 'base' });
  });
  return rows;
}

function makeHit(
  kind: 'exact' | 'replaceable',
  copy: CardCopy,
  row: SoughtRow,
  seq: number,
): CollectionMarkHit {
  return {
    hitId: `${kind}:${copy.copy_id}:${row.deck.deckId}:${row.card.instanceId}:${seq}`,
    copyId: copy.copy_id,
    deckId: row.deck.deckId,
    deckName: row.deck.name,
    instanceId: row.card.instanceId,
    cardName: row.card.name,
    currentSet: row.card.setCode,
    currentCollector: row.card.collectorNumber,
    currentFoil: Boolean(row.card.foil),
    currentScryfallId: row.card.scryfallId,
    currentImageUrl: rowImageUrl(row.deck, row.card),
    acquiredSet: copy.set_code || null,
    acquiredCollector: copy.collector_number || null,
    acquiredFinish: copy.finish || null,
    acquiredImageUrl: acquiredImageUrl(copy),
    kind,
  };
}

function assignHitsOntoRemaining(
  copies: CardCopy[],
  rows: SoughtRow[],
  remaining: Map<string, number>,
  mode: CollectionApplyMode,
  matcher: (copy: CardCopy, card: CardInstance) => boolean,
  kind: 'exact' | 'replaceable',
  seqStart: number,
): { hits: CollectionMarkHit[]; usedCopyIds: Set<string>; seq: number } {
  const hits: CollectionMarkHit[] = [];
  const usedCopyIds = new Set<string>();
  let seq = seqStart;

  for (const copy of copies) {
    const candidates = rows.filter((row) => {
      const key = `${row.deck.deckId}:${row.card.instanceId}`;
      return (remaining.get(key) || 0) > 0 && matcher(copy, row.card);
    });
    if (!candidates.length) continue;

    if (mode === 'broadcast') {
      for (const row of candidates) {
        const key = `${row.deck.deckId}:${row.card.instanceId}`;
        const left = remaining.get(key) || 0;
        if (left <= 0) continue;
        remaining.set(key, left - 1);
        hits.push(makeHit(kind, copy, row, seq++));
      }
      usedCopyIds.add(copy.copy_id);
    } else {
      const row = candidates[0];
      const key = `${row.deck.deckId}:${row.card.instanceId}`;
      remaining.set(key, (remaining.get(key) || 0) - 1);
      hits.push(makeHit(kind, copy, row, seq++));
      usedCopyIds.add(copy.copy_id);
    }
  }

  return { hits, usedCopyIds, seq };
}

export function buildCollectionMarkPlan(
  copies: CardCopy[],
  collections: DeckDocument[],
  mode: CollectionApplyMode,
): CollectionMarkPlan {
  const rows = collectSoughtRows(collections);
  const remaining = new Map(rows.map((r) => [`${r.deck.deckId}:${r.card.instanceId}`, r.remaining]));

  const exactResult = assignHitsOntoRemaining(
    copies,
    rows,
    remaining,
    mode,
    isExactPrintingMatch,
    'exact',
    0,
  );
  const leftover = copies.filter((c) => !exactResult.usedCopyIds.has(c.copy_id));
  const replaceResult = assignHitsOntoRemaining(
    leftover,
    rows,
    remaining,
    mode,
    isReplaceableMatch,
    'replaceable',
    exactResult.seq,
  );

  const exactRows = new Set(exactResult.hits.map((h) => `${h.deckId}:${h.instanceId}`));
  const replaceRows = new Set(replaceResult.hits.map((h) => `${h.deckId}:${h.instanceId}`));

  return {
    exact: exactResult.hits,
    replaceable: replaceResult.hits,
    exactRowCount: exactRows.size,
    exactBumpCount: exactResult.hits.length,
    replaceableRowCount: replaceRows.size,
  };
}

function bumpOwned(card: CardInstance, delta: number): CardInstance {
  const owned = collectionOwnedQuantity(card) + Math.max(0, delta);
  return { ...card, ownedQuantity: owned };
}

function applyHitsToCollections(
  collections: DeckDocument[],
  hits: CollectionMarkHit[],
  opts: { replacePrinting: boolean },
): DeckDocument[] {
  const bumps = new Map<string, number>();
  const printingByRow = new Map<string, PrintingFields>();

  for (const hit of hits) {
    const key = `${hit.deckId}:${hit.instanceId}`;
    bumps.set(key, (bumps.get(key) || 0) + 1);
    if (
      opts.replacePrinting &&
      String(hit.acquiredSet || '').trim() &&
      String(hit.acquiredCollector || '').trim()
    ) {
      printingByRow.set(
        key,
        printingFromAcquired({
          copy_id: hit.copyId,
          acquired_id: hit.copyId,
          card_name: hit.cardName,
          set_code: hit.acquiredSet,
          collector_number: hit.acquiredCollector,
          finish: hit.acquiredFinish,
        }),
      );
    }
  }

  return collections.map((deck) => {
    const touched = [...bumps.keys()].some((k) => k.startsWith(`${deck.deckId}:`));
    if (!touched) return deck;

    let next: DeckDocument = {
      ...deck,
      cards: deck.cards.map((card) => {
        const key = `${deck.deckId}:${card.instanceId}`;
        const delta = bumps.get(key);
        if (!delta) return card;
        return bumpOwned(card, delta);
      }),
      updatedAt: new Date().toISOString(),
    };

    if (opts.replacePrinting) {
      for (const [key, printing] of printingByRow) {
        if (!key.startsWith(`${deck.deckId}:`)) continue;
        const instanceId = key.slice(deck.deckId.length + 1);
        next = changeCardPrinting(next, instanceId, printing);
      }
    }

    return syncCollectionDeck(next);
  });
}

export function applyExactCollectionMarks(
  collections: DeckDocument[],
  hits: CollectionMarkHit[],
): DeckDocument[] {
  return applyHitsToCollections(collections, hits, { replacePrinting: false });
}

export function applyCollectionPrintingReplaces(
  collections: DeckDocument[],
  hits: CollectionMarkHit[],
): DeckDocument[] {
  return applyHitsToCollections(collections, hits, { replacePrinting: true });
}

export function copiesRemainingAfterHits(copies: CardCopy[], hits: CollectionMarkHit[]): CardCopy[] {
  const used = new Set(hits.map((h) => h.copyId));
  return copies.filter((c) => !used.has(c.copy_id));
}

export async function loadCollectionDecks(): Promise<DeckDocument[]> {
  let summaries;
  try {
    summaries = await pullRemoteLibraryUpdates();
  } catch {
    summaries = await listFallbackLibrary();
  }
  const docs: DeckDocument[] = [];
  for (const s of summaries) {
    if (!isCollectionDeck(s)) continue;
    const doc = await resolveLibraryDocument(s.deckId);
    if (!doc || !isCollectionDeck(doc)) continue;
    docs.push(syncCollectionDeck(doc));
  }
  docs.sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { sensitivity: 'base' }));
  return docs;
}

export async function persistCollectionDecks(collections: DeckDocument[]): Promise<{
  saved: DeckDocument[];
  errors: string[];
}> {
  const saved: DeckDocument[] = [];
  const errors: string[] = [];
  for (const doc of collections) {
    const result = await saveDualMode(doc);
    saved.push(result.saved);
    if (result.apiError) errors.push(`${doc.name}: ${result.apiError}`);
  }
  return { saved, errors };
}

/** Stable printing identity helper for tests / debugging. */
export function acquiredPrintingKey(copy: CardCopy): string {
  return printingKeyFromCard({
    name: copy.card_name,
    scryfallId: null,
    setCode: copy.set_code || null,
    collectorNumber: copy.collector_number || null,
    foil: acquiredIsFoil(copy.finish) === true,
  });
}
