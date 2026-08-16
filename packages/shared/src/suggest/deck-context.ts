import {
  applyFormalSwapsToCards,
  applyLookingForToCards,
  deriveSwapQueue,
  getOracle,
  isSeekingCategory,
  isSwapInCategory,
  type DeckDocument,
  type DeckWithSnapshot,
} from '@rayenz-hub/shared';
import type { DeckRecord, SetPoolCard, SetScope, SnapshotCard } from './types';
import { resolveDeckEligibility } from './eligibility';
import { parseYamlProfile } from './profile-parse';

export function indexSetPool(scope: SetScope | null): SetScope | null {
  if (!scope) {
    return scope;
  }
  if (scope.indexVersion === 1 && scope.cardsByName) {
    return scope;
  }
  const cardsByName: Record<string, SetScope['cards']> = {};
  (scope.cards || []).forEach((card) => {
    const key = String(card.name || '').toLowerCase();
    if (!key) {
      return;
    }
    if (!cardsByName[key]) {
      cardsByName[key] = [];
    }
    cardsByName[key].push(normalizePoolCard(card));
  });
  scope.cards = (scope.cards || []).map(normalizePoolCard);
  scope.cardsByName = cardsByName;
  scope.indexVersion = 1;
  return scope;
}

export function ensureSetPoolIndexed(scope: SetScope | null): SetScope | null {
  return indexSetPool(scope);
}

export function buildDeckRuleContext(deck: DeckRecord) {
  if (deck.ruleContext && deck.ruleContext.version === 2) {
    return deck.ruleContext;
  }
  const deckNames: Record<string, boolean> = {};
  const ownedNames: Record<string, boolean> = {};
  ((deck.deck_snapshot && deck.deck_snapshot.cards) || []).forEach((card) => {
    if (!card.name) return;
    const key = card.name.toLowerCase();
    deckNames[key] = true;
    const primary = card.primary_category || (card.categories && card.categories[0]);
    if (isSeekingCategory(primary) || isSwapInCategory(primary)) {
      return;
    }
    ownedNames[key] = true;
  });
  deck.ruleContext = {
    version: 2,
    swapQueue: deriveSwapQueue(deck as DeckWithSnapshot),
    deckNames,
    ownedNames,
    cutCandidates: null,
  };
  return deck.ruleContext;
}

export function getDeckSwapQueue(deck: DeckRecord) {
  return buildDeckRuleContext(deck).swapQueue;
}

export function hubDeckToRecord(doc: DeckDocument): DeckRecord {
  let cards = applyFormalSwapsToCards(doc.cards || [], doc.formalSwapEntries || [], doc.format);
  cards = applyLookingForToCards(cards, doc.lookingForEntries || [], doc.format);
  const snapshotCards: SnapshotCard[] = cards.map((c) => {
    const oracle = getOracle(doc, c);
    const categories = [c.primaryCategory, ...(c.categories || []).filter((x) => x !== c.primaryCategory)];
    return {
      name: c.name,
      set_code: c.setCode,
      collector_number: c.collectorNumber,
      quantity: c.quantity,
      primary_category: c.primaryCategory,
      categories,
      cmc: oracle?.manaValue ?? undefined,
      type_line: oracle?.typeLine ?? undefined,
      oracle_text: oracle?.oracleText ?? undefined,
      keywords: oracle?.keywords ?? undefined,
      color_identity: oracle?.colourIdentity,
    };
  });
  return {
    deck_id: doc.deckId,
    deck_name: doc.name,
    archidekt_url: doc.archidektUrl || '',
    format: doc.format,
    ownership: doc.ownership === 'theory' ? 'theory' : 'owned',
    deck_snapshot: {
      fetched_at: new Date().toISOString().slice(0, 10),
      source: 'hub-library',
      cards: snapshotCards,
    },
  };
}

export function setScopeFromPool(pool: {
  codesKey: string;
  codes: string[];
  complete?: boolean;
  primaryCode?: string;
  setName?: string;
  cards: Record<string, unknown>[];
}): SetScope {
  return indexSetPool({
    primaryCode: pool.primaryCode || pool.codes[0],
    codes: pool.codes.map((c) => String(c).toUpperCase()),
    codesKey: pool.codesKey,
    setName: pool.setName || pool.codes.join('/'),
    cards: pool.cards.map((c) => normalizePoolCard(c as SetPoolCard)),
    complete: pool.complete !== false,
    source: 'hub-set-pool',
  })!;
}

export function normalizePoolCard(card: SetPoolCard): SetPoolCard {
  const raw = card as SetPoolCard & {
    setCode?: string;
    collectorNumber?: string;
    typeLine?: string;
    oracleText?: string;
    colorIdentity?: string[];
    manaValue?: number;
    oracle_tags?: string[];
    tags?: string[];
  };
  return {
    ...raw,
    name: raw.name,
    set_code: raw.set_code || raw.setCode,
    collector_number: raw.collector_number || raw.collectorNumber,
    type_line: raw.type_line || raw.typeLine,
    oracle_text: raw.oracle_text || raw.oracleText,
    color_identity: raw.color_identity || raw.colorIdentity,
    cmc: raw.cmc != null ? raw.cmc : raw.manaValue,
    oracle_tags: raw.oracle_tags,
    tags: raw.tags,
  };
}

export const Data = {
  indexSetPool,
  ensureSetPoolIndexed,
  buildDeckRuleContext,
  getDeckSwapQueue,
  hubDeckToRecord,
  setScopeFromPool,
  resolveDeckEligibility,
  parseYamlProfile,
};
