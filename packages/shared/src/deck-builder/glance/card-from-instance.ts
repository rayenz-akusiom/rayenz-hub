import type { CardInstance, DeckDocument } from '../../schemas/deck-builder.js';
import { getOracle, resolveCardView } from '../card-oracle.js';
import { cardImageUrl, scryfallCdnUrlWithSize, scryfallImageFromId } from '../scryfall-images.js';
import { isBasicLand } from '../quantities.js';
import type { GlanceCard } from './types.js';

/** Type line of the front face only (text before the ` // ` DFC separator). */
export function frontFaceTypeLine(typeLine: string | null | undefined): string {
  const raw = String(typeLine || '');
  const sep = raw.indexOf(' // ');
  return sep === -1 ? raw : raw.slice(0, sep);
}

/**
 * Only treat a card as a land when its FRONT face is a Land. This keeps DFCs
 * whose land side is the back face (e.g. `Creature // Land`) in the main deck.
 */
export function isLandType(typeLine: string | null | undefined, basic: boolean): boolean {
  if (basic) return true;
  return /\bLand\b/i.test(frontFaceTypeLine(typeLine));
}

function basicLandColours(name: string): string[] {
  const n = String(name || '').trim().toLowerCase();
  if (n.includes('plains')) return ['W'];
  if (n.includes('island')) return ['U'];
  if (n.includes('swamp')) return ['B'];
  if (n.includes('mountain')) return ['R'];
  if (n.includes('forest')) return ['G'];
  if (n.includes('wastes')) return [];
  return [];
}

function resolvePrintedColours(
  card: CardInstance,
  oracle: ReturnType<typeof getOracle>,
  typeLine: string | null,
): string[] {
  const fromOracle = oracle?.colours;
  if (Array.isArray(fromOracle) && fromOracle.length) {
    return fromOracle.map((c) => String(c).toUpperCase()).filter(Boolean);
  }
  if (isBasicLand({ name: card.name, typeLine })) {
    return basicLandColours(card.name);
  }
  return [];
}

function resolveColourIdentity(
  card: CardInstance,
  oracle: ReturnType<typeof getOracle>,
  typeLine: string | null,
): string[] {
  const fromOracle = oracle?.colourIdentity;
  if (Array.isArray(fromOracle) && fromOracle.length) {
    return fromOracle.map((c) => String(c).toUpperCase()).filter(Boolean);
  }
  const fromCard = card.colourIdentity;
  if (Array.isArray(fromCard) && fromCard.length) {
    return fromCard.map((c) => String(c).toUpperCase()).filter(Boolean);
  }
  return resolvePrintedColours(card, oracle, typeLine);
}

export type ToGlanceCardOptions = {
  /** Include `proxy` on the glance card (swap Out badges). */
  includeProxy?: boolean;
};

/** Convert a deck card instance into a glance face payload. */
export function toGlanceCard(
  card: CardInstance,
  doc: DeckDocument,
  options: ToGlanceCardOptions = {},
): GlanceCard {
  const oracle = getOracle(doc, card);
  const view = resolveCardView(card, oracle);
  const typeLine = view.typeLine;
  const basic = isBasicLand({ name: card.name, typeLine });
  const scryfallId = card.scryfallId || view.scryfallId || oracle?.scryfallId || null;
  const fromId = scryfallImageFromId(scryfallId, undefined, 'normal');
  const fromView = view.imageUrl?.includes('cards.scryfall.io')
    ? scryfallCdnUrlWithSize(view.imageUrl, 'normal')
    : null;
  const fromCard = cardImageUrl({ ...view, scryfallId });
  const imageUrl =
    fromId ||
    fromView ||
    (fromCard.includes('cards.scryfall.io') ? scryfallCdnUrlWithSize(fromCard, 'normal') : fromCard || null) ||
    null;
  const result: GlanceCard = {
    instanceId: card.instanceId,
    name: card.name,
    setCode: card.setCode,
    collectorNumber: card.collectorNumber,
    typeLine,
    colours: resolvePrintedColours(card, oracle, typeLine),
    colourIdentity: resolveColourIdentity(card, oracle, typeLine),
    primaryCategory: card.primaryCategory,
    quantity: Math.max(1, Number(card.quantity) || 1),
    imageUrl,
    isBasicLand: basic,
    isLand: isLandType(typeLine, basic),
  };
  if (options.includeProxy) {
    result.proxy = Boolean(card.proxy);
  }
  return result;
}
