import { useEffect, useRef, useState } from 'react';
import {
  cardOracleFromScryfall,
  collectionIdentifierForCard,
  fetchCardsCollection,
  getOracle,
  needsOracleEnrich,
  oracleKey,
  provisionalLayoutFromCard,
  nameOrTypeLooksDual,
  upsertOracle,
  type CardInstance,
  type CardOracle,
  type DeckDocument,
  type ScryfallCard,
  type ScryfallCollectionIdentifier,
} from '@rayenz-hub/shared';

export type ScryfallOracleCache = {
  colourIdentity: ('W' | 'U' | 'B' | 'R' | 'G')[];
  typeLine: string | null;
  scryfallId: string | null;
  layout: string | null;
  keywords: string[];
  partnerWith: string | null;
  oracleText?: string | null;
  imageUrl?: string | null;
};

/** @deprecated Prefer needsOracleEnrich(doc, card) */
export function needsEnrich(
  card: Pick<CardInstance, 'primaryCategory'> & {
    colourIdentity?: string[];
    typeLine?: string | null;
    keywords?: string[] | null;
  },
): boolean {
  const missingCi = !(card.colourIdentity && card.colourIdentity.length);
  const missingType = !card.typeLine;
  const missingLeaderKeywords =
    card.primaryCategory === 'Commander' || card.primaryCategory === 'Lieutenants'
      ? card.keywords == null
      : false;
  return missingCi || missingType || missingLeaderKeywords;
}

/** @deprecated Oracle lives on the deck document now. */
export function isUsableOracleCache(
  cached: ScryfallOracleCache | null,
  card: Pick<CardInstance, 'primaryCategory'> & {
    typeLine?: string | null;
    keywords?: string[] | null;
  },
): cached is ScryfallOracleCache {
  if (!cached) return false;
  if (!card.typeLine && !cached.typeLine) return false;
  if (
    (card.primaryCategory === 'Commander' || card.primaryCategory === 'Lieutenants') &&
    card.keywords == null &&
    !Array.isArray(cached.keywords)
  ) {
    return false;
  }
  return true;
}

export function enrichAttemptSignature(
  deckId: string,
  cards: CardInstance[],
  oracle: Record<string, CardOracle> | undefined,
): string {
  const doc = { oracle: oracle || {} };
  const missing = cards
    .filter((c) => needsOracleEnrich(doc, c))
    .map((c) => c.instanceId)
    .sort();
  return `${deckId}:${missing.join(',')}`;
}

/** @deprecated Prefer cardOracleFromScryfall + upsertOracle */
export function materialOraclePatch(
  card: {
    colourIdentity?: string[];
    typeLine?: string | null;
    layout?: string | null;
    scryfallId?: string | null;
    keywords?: string[] | null;
    partnerWith?: string | null;
  },
  oracle: ScryfallOracleCache,
): Partial<CardInstance> | null {
  const nextId = card.scryfallId || oracle.scryfallId || null;
  const idImproved = !card.scryfallId && Boolean(nextId);
  if (!idImproved) return null;
  return { scryfallId: nextId };
}

export function parseOracleJson(data: {
  id?: string;
  type_line?: string;
  color_identity?: string[];
  layout?: string;
  keywords?: string[];
  oracle_text?: string;
}): ScryfallOracleCache {
  const o = cardOracleFromScryfall(data);
  return {
    scryfallId: o.scryfallId,
    typeLine: o.typeLine,
    colourIdentity: o.colourIdentity,
    layout: o.layout,
    keywords: o.keywords || [],
    partnerWith: o.partnerWith,
    oracleText: o.oracleText,
    imageUrl: o.imageUrl,
  };
}

function identifierMatchKey(id: ScryfallCollectionIdentifier): string {
  if ('id' in id) return `id:${id.id.toLowerCase()}`;
  if ('set' in id) {
    return `print:${id.set.toLowerCase()}:${id.collector_number}`;
  }
  return `name:${id.name.toLowerCase()}`;
}

function cardMatchKeys(card: CardInstance): string[] {
  const keys: string[] = [];
  if (card.scryfallId) keys.push(`id:${String(card.scryfallId).toLowerCase()}`);
  if (card.setCode && card.collectorNumber != null && card.collectorNumber !== '') {
    keys.push(`print:${String(card.setCode).toLowerCase()}:${card.collectorNumber}`);
  }
  keys.push(`name:${card.name.toLowerCase()}`);
  return keys;
}

function indexCollectionResults(cards: ScryfallCard[]): Map<string, ScryfallCard> {
  const map = new Map<string, ScryfallCard>();
  for (const c of cards) {
    map.set(`id:${c.id.toLowerCase()}`, c);
    if (c.set && c.collector_number) {
      map.set(`print:${c.set.toLowerCase()}:${c.collector_number}`, c);
    }
    map.set(`name:${c.name.toLowerCase()}`, c);
  }
  return map;
}

/**
 * Fill deck.oracle for cards missing CI/type/leader keywords via Scryfall collection.
 * Calls onPatch with an updated DeckDocument (oracle + optional scryfallId on cards).
 */
export function useScryfallEnrich(
  deck: DeckDocument,
  enabled: boolean,
  onPatch: (next: DeckDocument) => void,
): { enriching: boolean } {
  const [enriching, setEnriching] = useState(false);
  const ranFor = useRef<string | null>(null);
  const deckRef = useRef(deck);
  const onPatchRef = useRef(onPatch);
  deckRef.current = deck;
  onPatchRef.current = onPatch;

  useEffect(() => {
    if (!enabled) return;

    const signature = enrichAttemptSignature(deck.deckId, deck.cards, deck.oracle);
    if (ranFor.current === signature) return;

    const needsNetwork = deck.cards.filter((c) => needsOracleEnrich(deck, c));
    const needsLocalLayout = deck.cards.filter((c) => {
      const o = getOracle(deck, c);
      if (o?.layout) return false;
      // Dual names need Scryfall layout; do not stamp provisional normal.
      if (nameOrTypeLooksDual(c.name, o?.typeLine)) return false;
      return true;
    });

    if (!needsNetwork.length && !needsLocalLayout.length) {
      ranFor.current = signature;
      return;
    }

    ranFor.current = signature;

    let cancelled = false;
    let settled = false;
    const abort = new AbortController();

    (async () => {
      setEnriching(true);
      let oracle = { ...(deck.oracle || {}) };
      let cards = deck.cards;
      let rateLimited = false;
      let changed = false;

      try {
        for (const card of needsLocalLayout) {
          if (cancelled) return;
          const key = oracleKey(card);
          const existing = oracle[key];
          const typeLine = existing?.typeLine ?? null;
          oracle = upsertOracle(oracle, key, {
            layout: provisionalLayoutFromCard(card.name, typeLine),
            typeLine,
            scryfallId: card.scryfallId || existing?.scryfallId || null,
          });
          changed = true;
        }

        if (needsNetwork.length && !cancelled) {
          const identifiers: ScryfallCollectionIdentifier[] = [];
          const seenIds = new Set<string>();
          for (const card of needsNetwork) {
            const id = collectionIdentifierForCard(card);
            if (!id) continue;
            const mk = identifierMatchKey(id);
            if (seenIds.has(mk)) continue;
            seenIds.add(mk);
            identifiers.push(id);
          }

          if (identifiers.length) {
            let result;
            try {
              result = await fetchCardsCollection(identifiers, {
                signal: abort.signal,
              });
            } catch (err) {
              if (cancelled || abort.signal.aborted) return;
              throw err;
            }
            if (cancelled) return;
            rateLimited = Boolean(result.rateLimited);

            const byKey = indexCollectionResults(result.data);
            for (const card of needsNetwork) {
              let found: ScryfallCard | undefined;
              for (const mk of cardMatchKeys(card)) {
                found = byKey.get(mk);
                if (found) break;
              }
              if (!found) continue;
              const entry = cardOracleFromScryfall(found);
              const key = oracleKey({
                ...card,
                scryfallId: card.scryfallId || entry.scryfallId,
              });
              oracle = upsertOracle(oracle, key, entry);
              if (!card.scryfallId && entry.scryfallId) {
                cards = cards.map((c) =>
                  c.instanceId === card.instanceId
                    ? { ...c, scryfallId: entry.scryfallId }
                    : c,
                );
              }
              changed = true;
            }
          }
        }

        if (cancelled) return;

        if (changed) {
          const latest = deckRef.current;
          const enrichById = new Map(cards.map((c) => [c.instanceId, c]));
          const mergedCards = latest.cards.map((c) => {
            const enriched = enrichById.get(c.instanceId);
            if (!enriched?.scryfallId || enriched.scryfallId === c.scryfallId) return c;
            return { ...c, scryfallId: enriched.scryfallId };
          });
          // Upsert this run's oracle onto the latest deck so concurrent edits (targets, etc.) survive.
          let mergedOracle = { ...(latest.oracle || {}) };
          for (const [key, entry] of Object.entries(oracle)) {
            mergedOracle = upsertOracle(mergedOracle, key, entry);
          }
          onPatchRef.current({
            ...latest,
            cards: mergedCards,
            oracle: mergedOracle,
            updatedAt: new Date().toISOString(),
          });
        }

        if (!rateLimited) {
          ranFor.current = signature;
        } else if (ranFor.current === signature) {
          ranFor.current = null;
        }
        settled = true;
      } finally {
        setEnriching(false);
      }
    })();

    return () => {
      cancelled = true;
      abort.abort();
      if (!settled && ranFor.current === signature) {
        ranFor.current = null;
      }
    };
  }, [deck.deckId, deck.cards, deck.oracle, enabled]);

  return { enriching };
}
