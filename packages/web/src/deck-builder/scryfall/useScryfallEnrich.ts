import { useEffect, useRef, useState } from 'react';
import {
  normalizeColourIdentity,
  type CardInstance,
  type DeckDocument,
} from '@rayenz-hub/shared';

const CACHE_DB = 'rayenz-deck-builder';
const CACHE_STORE = 'scryfall-oracle-v1';
const REQUEST_GAP_MS = 120;
const RATE_LIMIT_BACKOFF_MS = 2000;

export type ScryfallOracleCache = {
  colourIdentity: ('W' | 'U' | 'B' | 'R' | 'G')[];
  typeLine: string | null;
  scryfallId: string | null;
  layout: string | null;
};

type FetchOracleResult =
  | { ok: true; data: ScryfallOracleCache }
  | { ok: false; rateLimited?: boolean };

type EnrichCardFields = Pick<
  CardInstance,
  'colourIdentity' | 'typeLine' | 'layout' | 'scryfallId'
>;

function cacheKey(card: CardInstance): string {
  if (card.setCode && card.collectorNumber != null && card.collectorNumber !== '') {
    return `print:${String(card.setCode).toLowerCase()}:${card.collectorNumber}`;
  }
  return `name:${card.name.toLowerCase()}`;
}

function openCacheDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(CACHE_DB, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(CACHE_STORE)) {
          db.createObjectStore(CACHE_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function cacheGet(key: string): Promise<ScryfallOracleCache | null> {
  const db = await openCacheDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(CACHE_STORE, 'readonly');
      const req = tx.objectStore(CACHE_STORE).get(key);
      req.onsuccess = () => resolve((req.result as ScryfallOracleCache) || null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function cachePut(key: string, value: ScryfallOracleCache): Promise<void> {
  if (!value.typeLine) return;
  const db = await openCacheDb();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(CACHE_STORE, 'readwrite');
      tx.objectStore(CACHE_STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export function needsEnrich(
  card: Pick<CardInstance, 'colourIdentity' | 'typeLine' | 'layout'>,
): boolean {
  const missingCi = !(card.colourIdentity && card.colourIdentity.length);
  const missingType = !card.typeLine;
  const missingLayout = card.layout == null;
  return missingCi || missingType || missingLayout;
}

/** Cache is usable only when it can supply fields the card still needs. */
export function isUsableOracleCache(
  cached: ScryfallOracleCache | null,
  card: Pick<CardInstance, 'typeLine' | 'layout'>,
): cached is ScryfallOracleCache {
  if (!cached) return false;
  if (!card.typeLine && !cached.typeLine) return false;
  if (card.layout == null && !cached.layout) return false;
  return true;
}

/** Attempt-once key: deck + cards that still need enrich (not updatedAt). */
export function enrichAttemptSignature(
  deckId: string,
  cards: Pick<CardInstance, 'instanceId' | 'colourIdentity' | 'typeLine' | 'layout'>[],
): string {
  const missing = cards
    .filter(needsEnrich)
    .map((c) => c.instanceId)
    .sort();
  return `${deckId}:${missing.join(',')}`;
}

/** Merge oracle data onto a card; returns null if nothing material improves. */
export function materialOraclePatch(
  card: EnrichCardFields,
  oracle: ScryfallOracleCache,
): Partial<CardInstance> | null {
  const nextType = card.typeLine || oracle.typeLine || null;
  const nextCi =
    card.colourIdentity?.length ? card.colourIdentity : oracle.colourIdentity;
  const nextId = card.scryfallId || oracle.scryfallId || null;
  const nextLayout = card.layout ?? oracle.layout ?? null;

  const typeImproved = !card.typeLine && Boolean(nextType);
  const ciImproved = !(card.colourIdentity && card.colourIdentity.length) && nextCi.length > 0;
  const idImproved = !card.scryfallId && Boolean(nextId);
  const layoutImproved = card.layout == null && Boolean(nextLayout);

  if (!typeImproved && !ciImproved && !idImproved && !layoutImproved) return null;
  // Still need a type line and oracle did not provide one — do not patch/cache.
  if (!card.typeLine && !nextType) return null;

  const patch: Partial<CardInstance> = {};
  if (typeImproved) patch.typeLine = nextType;
  if (ciImproved) patch.colourIdentity = nextCi;
  if (idImproved) patch.scryfallId = nextId;
  if (layoutImproved) patch.layout = nextLayout;
  return patch;
}

function parseOracleJson(data: {
  id?: string;
  type_line?: string;
  color_identity?: string[];
  layout?: string;
}): ScryfallOracleCache {
  return {
    scryfallId: data.id || null,
    typeLine: data.type_line || null,
    colourIdentity: normalizeColourIdentity(data.color_identity || []),
    layout: data.layout || 'normal',
  };
}

async function fetchOracleResponse(url: string): Promise<FetchOracleResult> {
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (res.status === 429) return { ok: false, rateLimited: true };
    if (!res.ok) return { ok: false };
    const data = (await res.json()) as {
      id?: string;
      type_line?: string;
      color_identity?: string[];
      layout?: string;
    };
    return { ok: true, data: parseOracleJson(data) };
  } catch {
    return { ok: false };
  }
}

async function fetchBySetCollector(
  setCode: string,
  collectorNumber: string,
): Promise<FetchOracleResult> {
  const set = encodeURIComponent(setCode.toLowerCase());
  const cn = encodeURIComponent(collectorNumber);
  return fetchOracleResponse(`https://api.scryfall.com/cards/${set}/${cn}`);
}

async function fetchNamed(name: string): Promise<FetchOracleResult> {
  return fetchOracleResponse(
    `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}`,
  );
}

/**
 * Enrich cards missing colour identity / type line / layout via Scryfall; caches in IndexedDB.
 * Calls onPatch when cards were updated.
 */
export function useScryfallEnrich(
  deck: DeckDocument,
  enabled: boolean,
  onPatch: (cards: CardInstance[]) => void,
): { enriching: boolean } {
  const [enriching, setEnriching] = useState(false);
  const ranFor = useRef<string | null>(null);
  const deckRef = useRef(deck);
  const onPatchRef = useRef(onPatch);
  deckRef.current = deck;
  onPatchRef.current = onPatch;

  useEffect(() => {
    if (!enabled) return;

    const signature = enrichAttemptSignature(deck.deckId, deck.cards);
    if (ranFor.current === signature) return;

    const missing = deck.cards.filter(needsEnrich);
    if (!missing.length) {
      ranFor.current = signature;
      return;
    }

    // Attempt once for this missing set (success or failure).
    ranFor.current = signature;

    let cancelled = false;
    (async () => {
      setEnriching(true);
      const updates = new Map<string, Partial<CardInstance>>();

      for (const card of missing) {
        if (cancelled) return;
        const key = cacheKey(card);
        const cached = await cacheGet(key);
        if (isUsableOracleCache(cached, card)) {
          const patch = materialOraclePatch(card, cached);
          if (patch) updates.set(card.instanceId, patch);
          continue;
        }

        let result: FetchOracleResult = { ok: false };
        if (card.setCode && card.collectorNumber) {
          result = await fetchBySetCollector(
            String(card.setCode),
            String(card.collectorNumber),
          );
        }
        if (!result.ok && !result.rateLimited) {
          result = await fetchNamed(card.name);
        }
        if (result.ok) {
          const patch = materialOraclePatch(card, result.data);
          if (patch) {
            await cachePut(key, result.data);
            updates.set(card.instanceId, patch);
          }
        } else if (result.rateLimited) {
          await new Promise((r) => setTimeout(r, RATE_LIMIT_BACKOFF_MS));
          break;
        }

        await new Promise((r) => setTimeout(r, REQUEST_GAP_MS));
      }

      if (cancelled) {
        setEnriching(false);
        return;
      }

      if (!updates.size) {
        setEnriching(false);
        return;
      }

      const current = deckRef.current;
      const nextCards = current.cards.map((c) => {
        const patch = updates.get(c.instanceId);
        return patch ? { ...c, ...patch } : c;
      });
      onPatchRef.current(nextCards);
      setEnriching(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [deck.deckId, deck.cards, enabled]);

  return { enriching };
}
