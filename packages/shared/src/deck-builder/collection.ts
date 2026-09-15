import type {
  CardInstance,
  CardOracle,
  CollectionRepresentativeCard,
  CollectionSearch,
  CollectionTemplate,
  DeckDocument,
} from '../schemas/deck-builder.js';
import { cardDisplayName, resolveCardView } from './card-oracle.js';
import { ensureCategoryDef } from './card-edits.js';
import { SEEKING } from '../mtg/swap-queue.js';
import { scryfallImageFromId } from './scryfall-images.js';

export const COLLECTION_FORMAT = 'collection';
export const COLLECTION_DEFAULT_CATEGORY = 'Collection';
export const COLLECTION_CARD_LIMIT = 2500;
/** Swim-lane label for cards marked won't collect. */
export const WONT_COLLECT = "Won't collect";
/** Synthetic Binder cover — not inventory; never sought / foil / seeking. */
export const COLLECTION_REPRESENTATIVE_INSTANCE_ID = '__collection_representative__';

export function isCollectionRepresentativeCard(
  card: Pick<CardInstance, 'instanceId'> | null | undefined,
): boolean {
  return card?.instanceId === COLLECTION_REPRESENTATIVE_INSTANCE_ID;
}

/** True when an inventory card is the same printing as the Binder cover art. */
export function cardMatchesCollectionRepresentative(
  card: Pick<CardInstance, 'name' | 'scryfallId' | 'setCode' | 'collectorNumber'> | null | undefined,
  rep: CollectionRepresentativeCard | null | undefined,
): boolean {
  if (!card || !rep) return false;
  const cardId = String(card.scryfallId || '').trim();
  const repId = String(rep.scryfallId || '').trim();
  if (cardId && repId) return cardId === repId;
  const cardSet = String(card.setCode || '').trim().toLowerCase();
  const repSet = String(rep.setCode || '').trim().toLowerCase();
  const cardCn = String(card.collectorNumber || '').trim().toLowerCase();
  const repCn = String(rep.collectorNumber || '').trim().toLowerCase();
  if (cardSet && repSet && cardCn && repCn) {
    return cardSet === repSet && cardCn === repCn;
  }
  if (!cardId && !repId && (!cardSet || !cardCn) && (!repSet || !repCn)) {
    return String(card.name || '').trim().toLowerCase() === String(rep.name || '').trim().toLowerCase();
  }
  return false;
}

export function isCollectionDeck(
  deck: Pick<DeckDocument, 'format'> | null | undefined,
): boolean {
  return deck?.format === COLLECTION_FORMAT;
}

export function defaultCollectionBrowseView(
  template: CollectionTemplate | null | undefined,
) {
  if (template === 'planeswalkers') return 'planeswalker_subtype';
  if (template === 'partners') return 'partner_pairing';
  return 'all_cards';
}

export function collectionOwnedQuantity(card: Pick<CardInstance, 'ownedQuantity'>): number {
  return Math.max(0, Math.floor(Number(card.ownedQuantity) || 0));
}

export function collectionTargetQuantity(card: Pick<CardInstance, 'quantity'>): number {
  return Math.max(1, Math.floor(Number(card.quantity) || 1));
}

export function collectionInDeckQuantity(
  card: Pick<CardInstance, 'inDeckQuantity' | 'ownedQuantity'>,
): number {
  const owned = collectionOwnedQuantity(card);
  return Math.min(owned, Math.max(0, Math.floor(Number(card.inDeckQuantity) || 0)));
}

export function collectionCardIsIgnored(
  card: Pick<CardInstance, 'collectionIgnored'> | null | undefined,
): boolean {
  return Boolean(card?.collectionIgnored);
}

export function collectionNeededQuantity(
  card: Pick<CardInstance, 'quantity' | 'ownedQuantity' | 'collectionIgnored'>,
): number {
  if (collectionCardIsIgnored(card)) return 0;
  return Math.max(0, collectionTargetQuantity(card) - collectionOwnedQuantity(card));
}

export function collectionCardIsSought(
  card: Pick<CardInstance, 'quantity' | 'ownedQuantity' | 'collectionIgnored'>,
): boolean {
  return collectionNeededQuantity(card) > 0;
}

export function splitCollectionIgnored<T extends Pick<CardInstance, 'collectionIgnored'>>(
  cards: readonly T[] | null | undefined,
): { active: T[]; ignored: T[] } {
  const active: T[] = [];
  const ignored: T[] = [];
  for (const card of cards || []) {
    if (collectionCardIsIgnored(card)) ignored.push(card);
    else active.push(card);
  }
  return { active, ignored };
}

/** Strip ignored cards from lane groups and append a trailing Won't collect lane when non-empty. */
export function withWontCollectLane<T extends Pick<CardInstance, 'collectionIgnored'>>(
  groups: ReadonlyArray<readonly [string, T[]]>,
): Array<[string, T[]]> {
  const ignored: T[] = [];
  const next: Array<[string, T[]]> = [];
  for (const [lane, cards] of groups) {
    if (lane === WONT_COLLECT) {
      ignored.push(...cards.filter(collectionCardIsIgnored));
      continue;
    }
    const active: T[] = [];
    for (const card of cards) {
      if (collectionCardIsIgnored(card)) ignored.push(card);
      else active.push(card);
    }
    if (active.length) next.push([lane, active]);
  }
  if (ignored.length) next.push([WONT_COLLECT, ignored]);
  return next;
}

export function collectionDefaultTargetQuantity(
  deck: Pick<DeckDocument, 'collectionSearch'> | null | undefined,
): number {
  return Math.max(1, Math.floor(Number(deck?.collectionSearch?.defaultQuantity) || 1));
}

export function collectionSeekingToggleEnabled(
  deck: Pick<DeckDocument, 'format' | 'collectionSearch'> | null | undefined,
): boolean {
  return isCollectionDeck(deck) && collectionDefaultTargetQuantity(deck) === 1;
}

export function syncCollectionCard(card: CardInstance): CardInstance {
  const owned = collectionOwnedQuantity(card);
  const inDeckQuantity = Math.min(
    owned,
    Math.max(0, Math.floor(Number(card.inDeckQuantity) || 0)),
  );
  const quantity = collectionTargetQuantity(card);
  const collectionIgnored = collectionCardIsIgnored(card);
  const categories = new Set((card.categories || []).filter(Boolean));
  categories.add(card.primaryCategory || COLLECTION_DEFAULT_CATEGORY);
  if (!collectionIgnored && quantity > owned) categories.add(SEEKING);
  else categories.delete(SEEKING);
  return {
    ...card,
    quantity,
    ownedQuantity: owned,
    inDeckQuantity,
    collectionIgnored,
    categories: [...categories],
  };
}

export function syncCollectionDeck(deck: DeckDocument): DeckDocument {
  if (!isCollectionDeck(deck)) return deck;
  const cards = (deck.cards || []).map(syncCollectionCard);
  return {
    ...deck,
    cards,
    categories: ensureCategoryDef(
      ensureCategoryDef(deck.categories || [], COLLECTION_DEFAULT_CATEGORY),
      SEEKING,
    ),
  };
}

export function toggleCollectionCardsSeeking(
  deck: DeckDocument,
  instanceIds: string[],
): DeckDocument {
  if (!isCollectionDeck(deck)) return deck;
  const ids = new Set((instanceIds || []).filter(Boolean));
  if (!ids.size) return deck;
  const targets = (deck.cards || []).filter((card) => ids.has(card.instanceId));
  if (!targets.length) return deck;
  const anyUnmarked = targets.some((card) => !collectionCardIsSought(card));
  const cards = deck.cards.map((card) => {
    if (!ids.has(card.instanceId)) return card;
    const target = collectionTargetQuantity(card);
    let owned = collectionOwnedQuantity(card);
    if (anyUnmarked) {
      if (owned >= target) owned = target - 1;
      return { ...card, ownedQuantity: owned, collectionIgnored: false };
    }
    if (owned < target) {
      owned = target;
    }
    return { ...card, ownedQuantity: owned };
  });
  return syncCollectionDeck({ ...deck, cards });
}

export function toggleCollectionCardsIgnored(
  deck: DeckDocument,
  instanceIds: string[],
): DeckDocument {
  if (!isCollectionDeck(deck)) return deck;
  const ids = new Set((instanceIds || []).filter(Boolean));
  if (!ids.size) return deck;
  const targets = (deck.cards || []).filter((card) => ids.has(card.instanceId));
  if (!targets.length) return deck;
  const anyActive = targets.some((card) => !collectionCardIsIgnored(card));
  const cards = deck.cards.map((card) => {
    if (!ids.has(card.instanceId)) return card;
    return { ...card, collectionIgnored: anyActive };
  });
  return syncCollectionDeck({ ...deck, cards });
}

export function toRepresentativeCardView(
  rep: CollectionRepresentativeCard,
): CardInstance & CardOracle {
  const card: CardInstance = {
    instanceId: COLLECTION_REPRESENTATIVE_INSTANCE_ID,
    name: rep.name,
    quantity: 1,
    ownedQuantity: 1,
    inDeckQuantity: 0,
    primaryCategory: 'Commander',
    categories: ['Commander'],
    stack: null,
    setCode: rep.setCode ?? null,
    collectorNumber: rep.collectorNumber ?? null,
    scryfallId: rep.scryfallId ?? null,
    archidektCardId: null,
    // Cover art only — never surface foil/seeking inventory marks.
    foil: false,
    proxy: false,
    collectionSource: 'manual',
    collectionIgnored: false,
  };
  return resolveCardView(card, {
    scryfallId: rep.scryfallId ?? null,
    colourIdentity: [],
    typeLine: null,
    layout: 'normal',
    keywords: null,
    partnerWith: null,
    oracleText: null,
    printedName: rep.printedName ?? null,
    flavorName: rep.flavorName ?? null,
    manaValue: null,
    imageUrl:
      rep.imageUrl ?? (rep.scryfallId ? scryfallImageFromId(rep.scryfallId) : null),
    colours: null,
    finishes: null,
    hasCommonPrinting: null,
    manaCost: null,
    producedMana: null,
    updatedAt: null,
  });
}

export function collectionCardDisplayName(card: CardInstance, oracle?: CardOracle | null): string {
  return cardDisplayName(resolveCardView(card, oracle));
}

export function collectionSearchNeedsReleaseRefresh(
  search: CollectionSearch | null | undefined,
): boolean {
  if (!search?.query) return false;
  const openedAt = search.lastOpenedAt ? Date.parse(search.lastOpenedAt) : NaN;
  if (!Number.isFinite(openedAt)) return true;
  const dayMs = 24 * 60 * 60 * 1000;
  return Date.now() - openedAt >= dayMs;
}

const PLANESWALKER_SUBTYPE = /Planeswalker\s+[—-]\s+(.+)$/i;

export function parsePlaneswalkerSubtype(typeLine: string | null | undefined): string | null {
  const raw = String(typeLine || '').trim();
  if (!raw) return null;
  const tokens: string[] = [];
  const seen = new Set<string>();
  for (const face of raw.split(/\s+\/\/\s+/)) {
    const match = face.match(PLANESWALKER_SUBTYPE);
    const name = match?.[1]?.trim();
    if (!name) continue;
    for (const token of name.split(/\s+/)) {
      if (!token) continue;
      const key = token.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      tokens.push(token);
    }
  }
  if (!tokens.length) return null;
  tokens.sort((a, b) => a.localeCompare(b));
  return tokens.join(' ');
}
