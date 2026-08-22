import type { CardInstance, DeckDocument } from '../../schemas/deck-builder.js';
import { isSeekingCategory, isSwapOutCategory } from '../../mtg/swap-queue.js';
import { categoryIncluded, COMMANDER_DECK_TARGET, sortCategoryKeys } from '../browse.js';
import { canonicalizeCategoryName } from '../category-names.js';
import { normalizeCardQuantities } from '../quantities.js';
import { formalSwapInIds, syncCardsWithFormalSwaps } from '../formal-swaps.js';
import { pickCommanderLeaders, collectCommanderGalleryExtraIds } from '../partner.js';
import { sortLands, sortNonLands } from './colour-sort.js';
import { toGlanceCard } from './card-from-instance.js';
import type {
  BuildGlanceIncludeSetOptions,
  GlanceCard,
  GlanceIncludeSetResult,
  GlanceLayoutMode,
  GlanceSection,
} from './types.js';
import { GLANCE_ROLE_HIGHLIGHT_LIMIT } from './types.js';

const MAYBEBOARD = 'Maybeboard';

/** Canonical Land / Lands section names used for under-void exclusion. */
export function isGlanceLandSectionName(name: string): boolean {
  const key = canonicalizeCategoryName(name).toLowerCase();
  return key === 'land' || key === 'lands';
}

function isExcludedFromInclude(
  card: CardInstance,
  deck: DeckDocument,
  outIds: Set<string>,
  inIds: Set<string>,
  galleryExtras: Set<string>,
): boolean {
  if (galleryExtras.has(card.instanceId)) return true;
  const primary = canonicalizeCategoryName(card.primaryCategory || 'Other');
  // Formal Ins win over Out when the same instance is both (pathological reprint bind).
  if (outIds.has(card.instanceId) && !inIds.has(card.instanceId)) return true;
  if (isSwapOutCategory(primary) && !inIds.has(card.instanceId)) return true;
  if (isSeekingCategory(primary)) return true;
  if (primary === MAYBEBOARD) return true;
  if (!categoryIncluded(deck.categories || [], primary)) return true;
  return false;
}

function roleKey(name: string): 'commander' | 'lieutenant' | null {
  const key = canonicalizeCategoryName(name).toLowerCase();
  if (key === 'commander' || key === 'arthur') return 'commander';
  if (key === 'lieutenant' || key === 'lieutenants' || key === 'excalibur') return 'lieutenant';
  return null;
}

function sortRoleCards(cards: GlanceCard[]): GlanceCard[] {
  return [...cards].sort((a, b) => {
    const nameCmp = a.name.localeCompare(b.name);
    if (nameCmp !== 0) return nameCmp;
    const setCmp = String(a.setCode || '').localeCompare(String(b.setCode || ''));
    if (setCmp !== 0) return setCmp;
    return a.instanceId.localeCompare(b.instanceId);
  });
}

function roleCards(cards: GlanceCard[], role: 'commander' | 'lieutenant'): GlanceCard[] {
  return sortRoleCards(cards.filter((c) => roleKey(c.primaryCategory || '') === role));
}

function pickRoles(cards: GlanceCard[], role: 'commander' | 'lieutenant'): GlanceCard[] {
  return roleCards(cards, role).slice(0, GLANCE_ROLE_HIGHLIGHT_LIMIT);
}

/**
 * Commander role plate: one primary per distinct oracle name.
 * Gallery extras are omitted from the include set (and deck size).
 */
function pickCommanderHighlights(
  cards: GlanceCard[],
  coverInstanceId?: string | null,
): GlanceCard[] {
  const commanders = roleCards(cards, 'commander');
  const leaders = pickCommanderLeaders(commanders, coverInstanceId);
  if (leaders.kind === 'none') return [];
  if (leaders.kind === 'many') {
    return leaders.groups.slice(0, GLANCE_ROLE_HIGHLIGHT_LIMIT).map((g) => g.primary);
  }
  return leaders.primaries;
}

/** Cards eligible for the glance include set, before role/land partitioning. */
function eligibleGlanceCards(deck: DeckDocument): {
  cards: GlanceCard[];
  quantitySum: number;
} {
  const synced = syncCardsWithFormalSwaps(deck);
  const outIds = new Set<string>();
  for (const entry of synced.formalSwapEntries || []) {
    if (entry.outInstanceId) outIds.add(entry.outInstanceId);
  }
  const inIds = formalSwapInIds(synced.formalSwapEntries);
  const galleryExtras = collectCommanderGalleryExtraIds(
    synced.cards || [],
    synced.coverInstanceId,
  );

  const includedCards: CardInstance[] = [];
  for (const card of synced.cards || []) {
    if (isExcludedFromInclude(card, synced, outIds, inIds, galleryExtras)) continue;
    includedCards.push(card);
  }

  // Ensure formal swap Ins remain even if miscategorized (In wins over Out).
  for (const card of synced.cards || []) {
    if (!inIds.has(card.instanceId)) continue;
    if (galleryExtras.has(card.instanceId)) continue;
    if (includedCards.some((c) => c.instanceId === card.instanceId)) continue;
    includedCards.push(card);
  }

  const quantitySum = includedCards.reduce((sum, c) => sum + (Number(c.quantity) || 1), 0);
  const normalized = normalizeCardQuantities(includedCards, 'commander');
  return { cards: normalized.map((c) => toGlanceCard(c, synced)), quantitySum };
}

/**
 * Every lieutenant candidate in the deck, sorted deterministically. Callers use
 * this to offer a highlight choice when more than `GLANCE_ROLE_HIGHLIGHT_LIMIT`
 * lieutenants exist.
 */
export function listGlanceLieutenants(deck: DeckDocument): GlanceCard[] {
  return roleCards(eligibleGlanceCards(deck).cards, 'lieutenant');
}

/** Synthetic empty faces so underfull decks still pack to `COMMANDER_DECK_TARGET`. */
export function makeGlancePlaceholders(count: number): GlanceCard[] {
  const n = Math.max(0, Math.floor(count));
  const out: GlanceCard[] = [];
  for (let i = 0; i < n; i++) {
    out.push({
      instanceId: `glance-placeholder:${i}`,
      name: '',
      setCode: null,
      collectorNumber: null,
      typeLine: null,
      colours: [],
      colourIdentity: [],
      primaryCategory: null,
      quantity: 1,
      imageUrl: null,
      isBasicLand: false,
      isLand: false,
      isPlaceholder: true,
    });
  }
  return out;
}

function sortSectionCards(name: string, cards: GlanceCard[]): GlanceCard[] {
  return isGlanceLandSectionName(name) ? sortLands(cards) : sortNonLands(cards);
}

function appendPlaceholders(sections: GlanceSection[], placeholders: GlanceCard[]): GlanceSection[] {
  if (!placeholders.length) return sections;
  if (!sections.length) {
    return [{ name: 'Main deck', cards: placeholders }];
  }
  const nonLandIdx = sections.reduce((best, s, i) => {
    if (isGlanceLandSectionName(s.name)) return best;
    if (best < 0) return i;
    return s.cards.length > sections[best]!.cards.length ? i : best;
  }, -1);
  const target = nonLandIdx >= 0 ? nonLandIdx : 0;
  return sections.map((s, i) =>
    i === target ? { ...s, cards: [...s.cards, ...placeholders] } : s,
  );
}

function buildTypeLineSections(
  remainder: GlanceCard[],
  placeholders: GlanceCard[],
): { nonLands: GlanceCard[]; lands: GlanceCard[]; sections: GlanceSection[] } {
  const lands = sortLands(remainder.filter((c) => c.isLand));
  const nonLands = sortNonLands(remainder.filter((c) => !c.isLand));
  const paddedNonLands = [...nonLands, ...placeholders];
  const sections: GlanceSection[] = [];
  if (paddedNonLands.length) sections.push({ name: 'Main deck', cards: paddedNonLands });
  if (lands.length) sections.push({ name: 'Lands', cards: lands });
  return { nonLands: paddedNonLands, lands, sections };
}

function buildPrimaryCategorySections(
  remainder: GlanceCard[],
  placeholders: GlanceCard[],
  deck: DeckDocument,
): GlanceSection[] {
  const groups = new Map<string, GlanceCard[]>();
  for (const card of remainder) {
    const key = canonicalizeCategoryName(card.primaryCategory || 'Other') || 'Other';
    const list = groups.get(key);
    if (list) list.push(card);
    else groups.set(key, [card]);
  }

  const categoryOrder = (deck.categories || []).map((c) => canonicalizeCategoryName(c.name));
  const keys = sortCategoryKeys([...groups.keys()], 'custom', categoryOrder);
  const sections: GlanceSection[] = keys
    .filter((k) => (groups.get(k) || []).length > 0)
    .map((name) => ({
      name,
      cards: sortSectionCards(name, groups.get(name) || []),
    }));

  return appendPlaceholders(sections, placeholders);
}

export function buildGlanceIncludeSet(
  deck: DeckDocument,
  options: BuildGlanceIncludeSetOptions = {},
): GlanceIncludeSetResult {
  const mode: GlanceLayoutMode = options.mode === 'primary_category' ? 'primary_category' : 'type_line';
  const { cards: glanceCards, quantitySum } = eligibleGlanceCards(deck);
  if (quantitySum > COMMANDER_DECK_TARGET) {
    return {
      ok: false,
      code: 'GLANCE_NOT_ELIGIBLE',
      message: `Deck must contain at most ${COMMANDER_DECK_TARGET} cards after swaps (found ${quantitySum}).`,
    };
  }

  const commanders = pickCommanderHighlights(glanceCards, deck.coverInstanceId);
  const selection = options.lieutenantInstanceIds;
  let lieutenants: GlanceCard[];
  if (selection && selection.length) {
    const candidates = roleCards(glanceCards, 'lieutenant');
    const byId = new Map(candidates.map((c) => [c.instanceId, c]));
    const picked: GlanceCard[] = [];
    for (const id of selection) {
      const card = byId.get(id);
      if (!card) {
        return {
          ok: false,
          code: 'GLANCE_INVALID_LIEUTENANTS',
          message: `Unknown lieutenant selection: ${id}.`,
        };
      }
      if (picked.some((c) => c.instanceId === id)) continue;
      picked.push(card);
    }
    if (picked.length > GLANCE_ROLE_HIGHLIGHT_LIMIT) {
      return {
        ok: false,
        code: 'GLANCE_INVALID_LIEUTENANTS',
        message: `Select at most ${GLANCE_ROLE_HIGHLIGHT_LIMIT} lieutenants to highlight.`,
      };
    }
    lieutenants = sortRoleCards(picked);
  } else {
    lieutenants = pickRoles(glanceCards, 'lieutenant');
  }
  const roleIds = new Set([
    ...commanders.map((c) => c.instanceId),
    ...lieutenants.map((c) => c.instanceId),
  ]);

  const remainder = glanceCards.filter((c) => !roleIds.has(c.instanceId));
  const placeholders = makeGlancePlaceholders(COMMANDER_DECK_TARGET - quantitySum);

  // Always compute type-line lists for back-compat fields.
  const typeLine = buildTypeLineSections(remainder, placeholders);
  const sections =
    mode === 'primary_category'
      ? buildPrimaryCategorySections(remainder, placeholders, deck)
      : typeLine.sections;

  return {
    ok: true,
    includeSet: {
      cards: [...glanceCards, ...placeholders],
      quantitySum: quantitySum + placeholders.length,
      commanders,
      lieutenants,
      nonLands: typeLine.nonLands,
      lands: typeLine.lands,
      mode,
      sections,
    },
  };
}
