import {
  COLLECTION_CARD_LIMIT,
  COLLECTION_DEFAULT_CATEGORY,
  addCardToDeck,
  cardImageUrl,
  changeCardPrinting,
  collectionInDeckQuantity,
  collectionNeededQuantity,
  collectionOwnedQuantity,
  collectionTargetQuantity,
  getOracle,
  isCollectionDeck,
  isTheoryDeck,
  syncCollectionDeck,
  type CardInstance,
  type DeckDocument,
  type PrintingFields,
} from '@rayenz-hub/shared';
import {
  listFallbackLibrary,
  pullRemoteLibraryUpdates,
  resolveLibraryDocument,
} from '../store/library-sync';

export type DeckCopy = {
  copyId: string;
  name: string;
  nameKey: string;
  printingKey: string;
  deckId: string;
  deckName: string;
  setCode: string | null;
  collectorNumber: string | null;
  scryfallId: string | null;
  foil: boolean;
  imageUrl: string;
  printing: PrintingFields;
};

export type CollectionDeckSyncConflict = {
  nameKey: string;
  name: string;
  needed: number;
  copies: DeckCopy[];
};

export type CollectionDeckSyncPlan = {
  autoCopies: DeckCopy[];
  conflicts: CollectionDeckSyncConflict[];
};

function nameKey(name: string): string {
  return String(name || '').trim().toLowerCase();
}

export function printingKeyFromCard(
  card: Pick<CardInstance, 'scryfallId' | 'setCode' | 'collectorNumber' | 'name' | 'foil'>,
): string {
  const foil = card.foil ? 'foil' : 'nf';
  if (card.scryfallId) return `id:${String(card.scryfallId).toLowerCase()}:${foil}`;
  if (card.setCode && card.collectorNumber != null && card.collectorNumber !== '') {
    return `print:${String(card.setCode).toLowerCase()}:${card.collectorNumber}:${foil}`;
  }
  return `name:${nameKey(card.name)}:${foil}`;
}

function printingFromCard(doc: DeckDocument, card: CardInstance): PrintingFields {
  const oracle = getOracle(doc, card);
  return {
    name: card.name,
    scryfallId: card.scryfallId || oracle?.scryfallId || '',
    setCode: card.setCode || '',
    collectorNumber: card.collectorNumber || '',
    typeLine: oracle?.typeLine ?? null,
    colourIdentity: oracle?.colourIdentity?.length ? oracle.colourIdentity : [],
    layout: oracle?.layout ?? 'normal',
    foil: Boolean(card.foil),
    printedName: oracle?.printedName ?? null,
    flavorName: oracle?.flavorName ?? null,
    manaValue: oracle?.manaValue ?? null,
    finishes: oracle?.finishes,
    hasCommonPrinting: oracle?.hasCommonPrinting,
    manaCost: oracle?.manaCost,
    producedMana: oracle?.producedMana,
  };
}

function sourceDeckEligible(doc: DeckDocument, skipDeckIds: Set<string>): boolean {
  if (skipDeckIds.has(doc.deckId)) return false;
  if (isTheoryDeck(doc)) return false;
  if (isCollectionDeck(doc)) return false;
  return true;
}

/** Non-proxy copies from owned commander/cube/pendragon/other decks. */
export function collectDeckCopies(
  decks: DeckDocument[],
  opts?: { skipDeckIds?: Iterable<string> },
): DeckCopy[] {
  const skipDeckIds = new Set(opts?.skipDeckIds || []);
  const copies: DeckCopy[] = [];
  for (const doc of decks) {
    if (!sourceDeckEligible(doc, skipDeckIds)) continue;
    for (const card of doc.cards || []) {
      if (card.proxy) continue;
      const name = String(card.name || '').trim();
      if (!name) continue;
      const qty = Math.max(1, Math.floor(Number(card.quantity) || 1));
      const printing = printingFromCard(doc, card);
      const key = printingKeyFromCard(card);
      const imageUrl = cardImageUrl({
        imageUrl: getOracle(doc, card)?.imageUrl,
        scryfallId: card.scryfallId,
        setCode: card.setCode,
        collectorNumber: card.collectorNumber,
        name,
      });
      for (let i = 0; i < qty; i += 1) {
        copies.push({
          copyId: `${doc.deckId}:${card.instanceId}:${i}`,
          name,
          nameKey: nameKey(name),
          printingKey: key,
          deckId: doc.deckId,
          deckName: doc.name,
          setCode: card.setCode || null,
          collectorNumber: card.collectorNumber || null,
          scryfallId: card.scryfallId || null,
          foil: Boolean(card.foil),
          imageUrl,
          printing,
        });
      }
    }
  }
  return copies;
}

export function planCollectionDeckSync(
  collection: DeckDocument,
  copies: DeckCopy[],
): CollectionDeckSyncPlan {
  const neededByName = new Map<string, { name: string; needed: number }>();
  for (const card of collection.cards || []) {
    const needed = collectionNeededQuantity(card);
    if (needed <= 0) continue;
    const key = nameKey(card.name);
    const prev = neededByName.get(key);
    if (prev) prev.needed += needed;
    else neededByName.set(key, { name: card.name, needed });
  }

  const copiesByName = new Map<string, DeckCopy[]>();
  for (const copy of copies) {
    if (!neededByName.has(copy.nameKey)) continue;
    const list = copiesByName.get(copy.nameKey);
    if (list) list.push(copy);
    else copiesByName.set(copy.nameKey, [copy]);
  }

  const autoCopies: DeckCopy[] = [];
  const conflicts: CollectionDeckSyncConflict[] = [];
  for (const [key, meta] of neededByName) {
    const pool = copiesByName.get(key) || [];
    if (!pool.length) continue;
    if (pool.length > meta.needed) {
      conflicts.push({ nameKey: key, name: meta.name, needed: meta.needed, copies: pool });
    } else {
      autoCopies.push(...pool);
    }
  }
  return { autoCopies, conflicts };
}

type RowBucket = {
  instanceId: string | null;
  printingKey: string | null;
  copies: DeckCopy[];
  startQuantity: number;
  startOwned: number;
  startInDeck: number;
  capacity: number;
  stolen: number;
};

function assignCopiesToRows(rows: CardInstance[], copies: DeckCopy[]): RowBucket[] {
  const remaining: RowBucket[] = rows.map((row) => ({
    instanceId: row.instanceId,
    printingKey: printingKeyFromCard(row),
    copies: [],
    startQuantity: collectionTargetQuantity(row),
    startOwned: collectionOwnedQuantity(row),
    startInDeck: collectionInDeckQuantity(row),
    capacity: collectionNeededQuantity(row),
    stolen: 0,
  }));
  const extras: RowBucket[] = [];

  for (const copy of copies) {
    let bucket =
      remaining.find(
        (b) => b.capacity > b.copies.length && b.printingKey === copy.printingKey,
      ) || remaining.find((b) => b.capacity > b.copies.length && b.copies.length === 0);
    if (bucket) {
      bucket.copies.push(copy);
      bucket.printingKey = copy.printingKey;
      continue;
    }
    const leftover = remaining.find((b) => b.capacity > b.copies.length + b.stolen);
    let extra = extras.find((e) => e.printingKey === copy.printingKey);
    if (!extra) {
      extra = {
        instanceId: null,
        printingKey: copy.printingKey,
        copies: [],
        startQuantity: 0,
        startOwned: 0,
        startInDeck: 0,
        capacity: Number.POSITIVE_INFINITY,
        stolen: 0,
      };
      extras.push(extra);
    }
    extra.copies.push(copy);
    if (leftover) leftover.stolen += 1;
  }

  return [...remaining.filter((b) => b.copies.length > 0 || b.stolen > 0), ...extras.filter((b) => b.copies.length > 0)];
}

/** Apply chosen (and auto) deck copies onto the open collection binder. */
export function applyCollectionDeckSync(
  collection: DeckDocument,
  copies: DeckCopy[],
): DeckDocument {
  if (!isCollectionDeck(collection) || !copies.length) {
    return syncCollectionDeck(collection);
  }

  const byName = new Map<string, DeckCopy[]>();
  for (const copy of copies) {
    const list = byName.get(copy.nameKey);
    if (list) list.push(copy);
    else byName.set(copy.nameKey, [copy]);
  }

  let next = collection;
  const extraPrintings: DeckCopy[][] = [];

  for (const [key, nameCopies] of byName) {
    const rows = (next.cards || []).filter((card) => nameKey(card.name) === key);
    const sought = rows.filter((card) => collectionNeededQuantity(card) > 0);
    const needed = sought.reduce((sum, card) => sum + collectionNeededQuantity(card), 0);
    const taken = nameCopies.slice(0, needed);
    if (!taken.length) continue;
    const buckets = assignCopiesToRows(sought.length ? sought : rows, taken);
    const ownedPatch = new Map<string, RowBucket>();
    for (const bucket of buckets) {
      if (bucket.instanceId) ownedPatch.set(bucket.instanceId, bucket);
      else extraPrintings.push(bucket.copies);
    }
    next = {
      ...next,
      cards: next.cards.map((card) => {
        const bucket = ownedPatch.get(card.instanceId);
        if (!bucket) return card;
        const owned = bucket.startOwned + bucket.copies.length;
        const inDeck = bucket.startInDeck + bucket.copies.length;
        const quantity = Math.max(owned, bucket.startQuantity - bucket.stolen);
        return {
          ...card,
          ownedQuantity: owned,
          inDeckQuantity: inDeck,
          quantity,
        };
      }),
    };
    for (const bucket of buckets) {
      if (!bucket.instanceId || !bucket.copies[0]) continue;
      next = changeCardPrinting(next, bucket.instanceId, bucket.copies[0].printing);
    }
  }

  for (const group of extraPrintings) {
    const first = group[0];
    if (!first) continue;
    if ((next.cards || []).length >= COLLECTION_CARD_LIMIT) break;
    next = addCardToDeck(next, first.printing, COLLECTION_DEFAULT_CATEGORY, {
      quantity: group.length,
    });
    const added = next.cards[next.cards.length - 1];
    if (added) {
      added.ownedQuantity = group.length;
      added.inDeckQuantity = group.length;
      added.collectionSource = 'manual';
    }
  }

  return syncCollectionDeck({ ...next, updatedAt: new Date().toISOString() });
}

export async function loadOwnedLibraryDecks(opts: {
  skipDeckIds?: Iterable<string>;
  onProgress?: (current: number, total: number) => void;
}): Promise<DeckDocument[]> {
  const skipDeckIds = new Set(opts.skipDeckIds || []);
  let summaries;
  try {
    summaries = await pullRemoteLibraryUpdates();
  } catch {
    summaries = await listFallbackLibrary();
  }
  const eligible = summaries.filter((s) => {
    if (skipDeckIds.has(s.deckId)) return false;
    if (isTheoryDeck(s)) return false;
    if (isCollectionDeck(s)) return false;
    return true;
  });
  const docs: DeckDocument[] = [];
  for (let i = 0; i < eligible.length; i += 1) {
    opts.onProgress?.(i, eligible.length);
    const row = eligible[i];
    if (!row) continue;
    const doc = await resolveLibraryDocument(row.deckId);
    if (!doc || !sourceDeckEligible(doc, skipDeckIds)) continue;
    docs.push(doc);
  }
  opts.onProgress?.(eligible.length, eligible.length);
  return docs;
}
