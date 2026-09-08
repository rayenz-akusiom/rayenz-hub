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
export const COLLECTION_CARD_LIMIT = 1000;

export function isCollectionDeck(
  deck: Pick<DeckDocument, 'format'> | null | undefined,
): boolean {
  return deck?.format === COLLECTION_FORMAT;
}

export function defaultCollectionBrowseView(
  template: CollectionTemplate | null | undefined,
) {
  return template === 'planeswalkers' ? 'planeswalker_subtype' : 'all_cards';
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

export function collectionNeededQuantity(
  card: Pick<CardInstance, 'quantity' | 'ownedQuantity'>,
): number {
  return Math.max(0, collectionTargetQuantity(card) - collectionOwnedQuantity(card));
}

export function collectionCardIsSought(
  card: Pick<CardInstance, 'quantity' | 'ownedQuantity'>,
): boolean {
  return collectionNeededQuantity(card) > 0;
}

export function syncCollectionCard(card: CardInstance): CardInstance {
  const owned = collectionOwnedQuantity(card);
  const inDeckQuantity = Math.min(
    owned,
    Math.max(0, Math.floor(Number(card.inDeckQuantity) || 0)),
  );
  const quantity = collectionTargetQuantity(card);
  const categories = new Set((card.categories || []).filter(Boolean));
  categories.add(card.primaryCategory || COLLECTION_DEFAULT_CATEGORY);
  if (quantity > owned) categories.add(SEEKING);
  else categories.delete(SEEKING);
  return {
    ...card,
    quantity,
    ownedQuantity: owned,
    inDeckQuantity,
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

export function toRepresentativeCardView(
  rep: CollectionRepresentativeCard,
): CardInstance & CardOracle {
  const card: CardInstance = {
    instanceId: '__collection_representative__',
    name: rep.name,
    quantity: 1,
    ownedQuantity: 0,
    inDeckQuantity: 0,
    primaryCategory: 'Commander',
    categories: ['Commander'],
    stack: null,
    setCode: rep.setCode ?? null,
    collectorNumber: rep.collectorNumber ?? null,
    scryfallId: rep.scryfallId ?? null,
    archidektCardId: null,
    foil: Boolean(rep.foil),
    proxy: false,
    collectionSource: 'manual',
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

export function parsePlaneswalkerSubtype(typeLine: string | null | undefined): string | null {
  const raw = String(typeLine || '');
  const match = raw.match(/Planeswalker\s+[—-]\s+(.+)$/i);
  if (!match) return null;
  return match[1]?.trim() || null;
}
