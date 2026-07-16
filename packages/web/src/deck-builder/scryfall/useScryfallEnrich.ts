import { useEffect, useRef, useState } from 'react';
import {
  normalizeColourIdentity,
  type CardInstance,
  type DeckDocument,
} from '@rayenz-hub/shared';

const CACHE_DB = 'rayenz-deck-builder';
const CACHE_STORE = 'scryfall-oracle-v1';

export type ScryfallOracleCache = {
  colourIdentity: ('W' | 'U' | 'B' | 'R' | 'G')[];
  typeLine: string | null;
  scryfallId: string | null;
};

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

function needsEnrich(card: CardInstance): boolean {
  const missingCi = !(card.colourIdentity && card.colourIdentity.length);
  const missingType = !card.typeLine;
  return missingCi || missingType;
}

async function fetchNamed(name: string): Promise<ScryfallOracleCache | null> {
  try {
    const res = await fetch(
      `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}`,
      { headers: { Accept: 'application/json' } },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      id?: string;
      type_line?: string;
      color_identity?: string[];
    };
    return {
      scryfallId: data.id || null,
      typeLine: data.type_line || null,
      colourIdentity: normalizeColourIdentity(data.color_identity || []),
    };
  } catch {
    return null;
  }
}

async function fetchCollection(
  identifiers: { set?: string; collector_number?: string; name?: string }[],
): Promise<Map<number, ScryfallOracleCache>> {
  const out = new Map<number, ScryfallOracleCache>();
  if (!identifiers.length) return out;
  try {
    const res = await fetch('https://api.scryfall.com/cards/collection', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifiers }),
    });
    if (!res.ok) return out;
    const data = (await res.json()) as {
      data?: { id?: string; type_line?: string; color_identity?: string[]; name?: string }[];
      not_found?: unknown[];
    };
    for (const card of data.data || []) {
      // collection returns in request order for found cards — map by matching later
      void card;
    }
    // Scryfall collection preserves order of found relative to request indices via parallel arrays poorly;
    // match by set+cn or name against identifiers.
    const found = data.data || [];
    for (let i = 0; i < identifiers.length; i++) {
      const id = identifiers[i];
      const match = found.find((c) => {
        if (id.name) return c.name?.toLowerCase() === id.name.toLowerCase();
        return true;
      });
      // Better: use response order — Scryfall returns cards in same order as identifiers for matches,
      // skipping not_found. We'll assign sequentially for simplicity when using set+cn batches.
      void match;
    }
    // Simpler approach: zip found cards with successful lookups by iterating identifiers
    // and consuming from found queue when matched.
    let fi = 0;
    for (let i = 0; i < identifiers.length; i++) {
      const id = identifiers[i];
      const card = found[fi];
      if (!card) break;
      const okName = !id.name || card.name?.toLowerCase() === id.name.toLowerCase();
      if (!okName && id.name) continue;
      out.set(i, {
        scryfallId: card.id || null,
        typeLine: card.type_line || null,
        colourIdentity: normalizeColourIdentity(card.color_identity || []),
      });
      fi += 1;
    }
  } catch {
    /* ignore */
  }
  return out;
}

/**
 * Enrich cards missing colour identity / type line via Scryfall; caches in IndexedDB.
 * Calls onPatch when cards were updated.
 */
export function useScryfallEnrich(
  deck: DeckDocument,
  enabled: boolean,
  onPatch: (cards: CardInstance[]) => void,
): { enriching: boolean } {
  const [enriching, setEnriching] = useState(false);
  const ranFor = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const signature = `${deck.deckId}:${deck.updatedAt}:${deck.cards.length}`;
    if (ranFor.current === signature) return;

    const missing = deck.cards.filter(needsEnrich);
    if (!missing.length) {
      ranFor.current = signature;
      return;
    }

    let cancelled = false;
    (async () => {
      setEnriching(true);
      const updates = new Map<string, Partial<CardInstance>>();

      for (const card of missing) {
        if (cancelled) return;
        const key = cacheKey(card);
        const cached = await cacheGet(key);
        if (cached) {
          updates.set(card.instanceId, {
            colourIdentity:
              card.colourIdentity?.length ? card.colourIdentity : cached.colourIdentity,
            typeLine: card.typeLine || cached.typeLine,
            scryfallId: card.scryfallId || cached.scryfallId,
          });
          continue;
        }

        let fetched: ScryfallOracleCache | null = null;
        if (card.setCode && card.collectorNumber) {
          const coll = await fetchCollection([
            { set: String(card.setCode).toLowerCase(), collector_number: String(card.collectorNumber) },
          ]);
          fetched = coll.get(0) || null;
        }
        if (!fetched) {
          fetched = await fetchNamed(card.name);
        }
        if (fetched) {
          await cachePut(key, fetched);
          updates.set(card.instanceId, {
            colourIdentity:
              card.colourIdentity?.length ? card.colourIdentity : fetched.colourIdentity,
            typeLine: card.typeLine || fetched.typeLine,
            scryfallId: card.scryfallId || fetched.scryfallId,
          });
        }
        // Gentle rate limit for named fallbacks
        await new Promise((r) => setTimeout(r, 80));
      }

      if (cancelled || !updates.size) {
        setEnriching(false);
        ranFor.current = signature;
        return;
      }

      const nextCards = deck.cards.map((c) => {
        const patch = updates.get(c.instanceId);
        return patch ? { ...c, ...patch } : c;
      });
      onPatch(nextCards);
      ranFor.current = signature;
      setEnriching(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [deck, enabled, onPatch]);

  return { enriching };
}
