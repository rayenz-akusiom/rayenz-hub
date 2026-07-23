import type { CardInstance, DeckDocument } from '../../schemas/deck-builder.js';
import { isSeekingCategory, isSwapOutCategory } from '../../mtg/swap-queue.js';
import { categoryIncluded, COMMANDER_DECK_TARGET } from '../browse.js';
import { canonicalizeCategoryName } from '../category-names.js';
import { getOracle, resolveCardView } from '../card-oracle.js';
import { cardImageUrl, scryfallCdnUrlWithSize, scryfallImageFromId } from '../scryfall-images.js';
import { isBasicLand, normalizeCardQuantities } from '../quantities.js';
import { formalSwapInIds, syncCardsWithFormalSwaps } from '../formal-swaps.js';
import { sortLands, sortNonLands } from './colour-sort.js';
import type { GlanceCard, GlanceIncludeSetResult } from './types.js';

const MAYBEBOARD = 'Maybeboard';

function isLandType(typeLine: string | null | undefined, basic: boolean): boolean {
  if (basic) return true;
  return /\bLand\b/i.test(String(typeLine || ''));
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

function toGlanceCard(card: CardInstance, doc: DeckDocument): GlanceCard {
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
  return {
    instanceId: card.instanceId,
    name: card.name,
    setCode: card.setCode,
    collectorNumber: card.collectorNumber,
    typeLine,
    colours: resolvePrintedColours(card, oracle, typeLine),
    primaryCategory: card.primaryCategory,
    quantity: Math.max(1, Number(card.quantity) || 1),
    imageUrl,
    isBasicLand: basic,
    isLand: isLandType(typeLine, basic),
  };
}

function isExcludedFromInclude(card: CardInstance, deck: DeckDocument, outIds: Set<string>): boolean {
  const primary = canonicalizeCategoryName(card.primaryCategory || 'Other');
  if (outIds.has(card.instanceId)) return true;
  if (isSwapOutCategory(primary)) return true;
  if (isSeekingCategory(primary)) return true;
  if (primary === MAYBEBOARD) return true;
  if (!categoryIncluded(deck.categories || [], primary)) return true;
  return false;
}

function roleKey(name: string): 'commander' | 'lieutenant' | null {
  const key = canonicalizeCategoryName(name).toLowerCase();
  if (key === 'commander') return 'commander';
  if (key === 'lieutenant' || key === 'lieutenants') return 'lieutenant';
  return null;
}

function pickRoles(cards: GlanceCard[], role: 'commander' | 'lieutenant'): GlanceCard[] {
  return cards
    .filter((c) => roleKey(c.primaryCategory || '') === role)
    .sort((a, b) => {
      const nameCmp = a.name.localeCompare(b.name);
      if (nameCmp !== 0) return nameCmp;
      const setCmp = String(a.setCode || '').localeCompare(String(b.setCode || ''));
      if (setCmp !== 0) return setCmp;
      return a.instanceId.localeCompare(b.instanceId);
    })
    .slice(0, 2);
}

export function buildGlanceIncludeSet(deck: DeckDocument): GlanceIncludeSetResult {
  const synced = syncCardsWithFormalSwaps(deck);
  const outIds = new Set<string>();
  for (const entry of synced.formalSwapEntries || []) {
    if (entry.outInstanceId) outIds.add(entry.outInstanceId);
  }
  const inIds = formalSwapInIds(synced.formalSwapEntries);

  const includedCards: CardInstance[] = [];
  for (const card of synced.cards || []) {
    if (isExcludedFromInclude(card, synced, outIds)) continue;
    includedCards.push(card);
  }

  // Ensure formal swap Ins remain even if miscategorized.
  for (const card of synced.cards || []) {
    if (!inIds.has(card.instanceId)) continue;
    if (includedCards.some((c) => c.instanceId === card.instanceId)) continue;
    if (outIds.has(card.instanceId)) continue;
    includedCards.push(card);
  }

  const quantitySum = includedCards.reduce((sum, c) => sum + (Number(c.quantity) || 1), 0);
  if (quantitySum !== COMMANDER_DECK_TARGET) {
    return {
      ok: false,
      code: 'GLANCE_NOT_ELIGIBLE',
      message: `Deck must contain exactly ${COMMANDER_DECK_TARGET} cards after swaps (found ${quantitySum}).`,
    };
  }

  const normalized = normalizeCardQuantities(includedCards, 'commander');
  const glanceCards = normalized.map((c) => toGlanceCard(c, synced));

  const commanders = pickRoles(glanceCards, 'commander');
  const lieutenants = pickRoles(glanceCards, 'lieutenant');
  const roleIds = new Set([
    ...commanders.map((c) => c.instanceId),
    ...lieutenants.map((c) => c.instanceId),
  ]);

  const remainder = glanceCards.filter((c) => !roleIds.has(c.instanceId));
  const lands = sortLands(remainder.filter((c) => c.isLand));
  const nonLands = sortNonLands(remainder.filter((c) => !c.isLand));

  return {
    ok: true,
    includeSet: {
      cards: glanceCards,
      quantitySum,
      commanders,
      lieutenants,
      nonLands,
      lands,
    },
  };
}
