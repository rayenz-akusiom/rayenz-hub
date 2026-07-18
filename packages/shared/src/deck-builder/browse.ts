import type {
  BrowseView,
  CardInstance,
  CategoryDef,
  DeckDocument,
  DeckFormat,
} from '../schemas/deck-builder.js';
import { isSwapQueueCategoryName } from '../mtg/swap-queue.js';
import { canonicalizeCategoryName } from './category-names.js';
import { cubeCategorySectionsOrder } from './colour-identity.js';

export const HEADER_CATEGORIES = ['Commander', 'Lieutenants'] as const;

export const COMMANDER_DECK_TARGET = 100;

export type CategoryMembership = 'primary' | 'secondary';

export type CategorizedCard<T extends CardInstance = CardInstance> = T & {
  membership: CategoryMembership;
};

export type CategoryKeySort =
  | 'alpha'
  | 'cube_ci'
  | 'custom';

export function isSwapQueueCategory(name: string): boolean {
  return isSwapQueueCategoryName(name);
}

export function isCategoryBrowseView(view: BrowseView): boolean {
  return view === 'category' || view === 'category_custom' || view === 'category_multi';
}

export function categoryKeySortFor(
  view: BrowseView,
  format: DeckFormat,
): CategoryKeySort {
  if (view === 'category_custom') return 'custom';
  if (format === 'cube' && (view === 'category' || view === 'category_multi')) {
    return 'cube_ci';
  }
  return 'alpha';
}

export function groupByCategory(cards: CardInstance[]): Record<string, CardInstance[]> {
  const groups: Record<string, CardInstance[]> = {};
  for (const card of cards) {
    const key = canonicalizeCategoryName(card.primaryCategory || 'Other') || 'Other';
    if (!groups[key]) groups[key] = [];
    groups[key].push(card);
  }
  return groups;
}

/** Place a card into every membership in `categories[]` (primary + secondaries). */
export function groupByAllCategories<T extends CardInstance>(
  cards: T[],
): Record<string, CategorizedCard<T>[]> {
  const groups: Record<string, CategorizedCard<T>[]> = {};
  for (const card of cards) {
    const primary = canonicalizeCategoryName(card.primaryCategory || 'Other') || 'Other';
    const memberships = [
      ...new Set([
        primary,
        ...(card.categories || [])
          .map((c) => canonicalizeCategoryName(String(c || '').trim()))
          .filter(Boolean),
      ]),
    ];
    for (const key of memberships) {
      if (!groups[key]) groups[key] = [];
      groups[key].push({
        ...card,
        membership: key === primary ? 'primary' : 'secondary',
      });
    }
  }
  return groups;
}

export function moveCardCategory(
  cards: CardInstance[],
  instanceId: string,
  primaryCategory: string,
  stack: string | null = null,
): CardInstance[] {
  return cards.map((c) => {
    if (c.instanceId !== instanceId) return c;
    const prevPrimary = c.primaryCategory;
    const existing = c.categories || [];
    const promoting =
      prevPrimary !== primaryCategory && existing.includes(primaryCategory);
    if (promoting) {
      // Drop onto an existing secondary → promote; old primary stays as secondary.
      const categories = [
        ...new Set([
          primaryCategory,
          prevPrimary,
          ...existing.filter((x) => x !== primaryCategory),
        ]),
      ];
      return { ...c, primaryCategory, categories, stack };
    }
    // Normal move: replace primary; keep other secondaries (not the old primary).
    const categories = [
      ...new Set([
        primaryCategory,
        ...existing.filter((x) => x !== prevPrimary && x !== primaryCategory),
      ]),
    ];
    return { ...c, primaryCategory, categories, stack };
  });
}

export function addSecondaryCategory(
  cards: CardInstance[],
  instanceId: string,
  category: string,
): CardInstance[] {
  const name = String(category || '').trim();
  if (!name) return cards;
  return cards.map((c) => {
    if (c.instanceId !== instanceId) return c;
    if (c.primaryCategory === name) return c;
    const categories = [...new Set([...(c.categories || []), name])];
    if (!categories.includes(c.primaryCategory)) {
      categories.unshift(c.primaryCategory);
    }
    return { ...c, categories };
  });
}

export function removeSecondaryCategory(
  cards: CardInstance[],
  instanceId: string,
  category: string,
): CardInstance[] {
  const name = String(category || '').trim();
  if (!name) return cards;
  return cards.map((c) => {
    if (c.instanceId !== instanceId) return c;
    if (c.primaryCategory === name) return c;
    const categories = (c.categories || []).filter((x) => x !== name);
    if (!categories.includes(c.primaryCategory)) {
      categories.unshift(c.primaryCategory);
    }
    return { ...c, categories };
  });
}

/** Non-primary category tags on a card. */
export function secondaryCategoriesOf(card: Pick<CardInstance, 'primaryCategory' | 'categories'>): string[] {
  const primary = card.primaryCategory || 'Other';
  return [...new Set((card.categories || []).filter((c) => c && c !== primary))];
}

function asCommander(card: CardInstance): CardInstance {
  if (card.primaryCategory === 'Commander') return card;
  return {
    ...card,
    primaryCategory: 'Commander',
    categories: [
      ...new Set([
        'Commander',
        ...(card.categories || []).filter((x) => x !== card.primaryCategory),
      ]),
    ],
  };
}

/**
 * Place (or reorder) a card into Commander slot 0 or 1.
 * Preserves non-commander card order; emits ordered commanders at the first
 * commander / incoming position in the deck list.
 */
export function placeCardInCommanderSlot(
  cards: CardInstance[],
  instanceId: string,
  slot: 0 | 1,
): CardInstance[] {
  const dropped = cards.find((c) => c.instanceId === instanceId);
  if (!dropped) return cards;

  const incoming = asCommander(dropped);
  const others = cards.filter(
    (c) => c.primaryCategory === 'Commander' && c.instanceId !== instanceId,
  );

  let ordered: CardInstance[];
  if (others.length === 0) {
    ordered = [incoming];
  } else if (others.length === 1) {
    ordered = slot === 0 ? [incoming, others[0]] : [others[0], incoming];
  } else {
    const pair = others.slice(0, 2);
    const rest = others.slice(2);
    const displaced = pair[slot];
    const kept = pair[1 - slot];
    const newPair = slot === 0 ? [incoming, kept] : [kept, incoming];
    ordered = [...newPair, displaced, ...rest];
  }

  const result: CardInstance[] = [];
  let inserted = false;
  for (const c of cards) {
    const isIncoming = c.instanceId === instanceId;
    const isCommander = c.primaryCategory === 'Commander';
    if (isIncoming || isCommander) {
      if (!inserted) {
        result.push(...ordered);
        inserted = true;
      }
      continue;
    }
    result.push(c);
  }
  if (!inserted) result.push(...ordered);
  return result;
}

export function categoryIncluded(categories: CategoryDef[], name: string): boolean {
  const def = (categories || []).find((c) => c.name === name);
  if (!def) return true;
  return def.includedInDeck !== false;
}

/** Sum of quantities for cards whose primary category is included in the deck (Archidekt deck size). */
export function deckSize(deck: Pick<DeckDocument, 'cards' | 'categories'>): number {
  return (deck.cards || []).reduce((sum, card) => {
    if (!categoryIncluded(deck.categories || [], card.primaryCategory || 'Other')) return sum;
    return sum + (Number(card.quantity) || 1);
  }, 0);
}

export function totalCardQuantity(cards: CardInstance[]): number {
  return (cards || []).reduce((sum, card) => sum + (Number(card.quantity) || 1), 0);
}

export function isHeaderCategory(name: string): boolean {
  return (HEADER_CATEGORIES as readonly string[]).includes(name);
}

/** Count of card instances whose primary category equals `name` (aliases normalized). */
export function primaryCategoryCount(
  cards: CardInstance[],
  name: string,
): number {
  const key = canonicalizeCategoryName(name);
  return (cards || []).filter(
    (c) => canonicalizeCategoryName(c.primaryCategory || 'Other') === key,
  ).length;
}

export function categoryTarget(
  categories: CategoryDef[],
  name: string,
): number | null {
  const key = canonicalizeCategoryName(name);
  const def = (categories || []).find((c) => canonicalizeCategoryName(c.name) === key);
  const t = def?.target;
  return t == null || !Number.isFinite(t) ? null : Math.max(0, Math.floor(Number(t)));
}

/** How many UI placeholder slots to append so visual length reaches `target`. */
export function categoryPlaceholderCount(
  primaryCount: number,
  target: number | null,
): number {
  if (target == null || target <= 0) return 0;
  return Math.max(0, Math.floor(target) - Math.max(0, primaryCount));
}

/** Included-in-deck category defs that have a numeric target. */
export function includedCategoriesWithTargets(
  categories: CategoryDef[],
): CategoryDef[] {
  return (categories || []).filter(
    (c) =>
      c.includedInDeck !== false &&
      !isHeaderCategory(c.name) &&
      !isSwapQueueCategory(c.name) &&
      c.target != null &&
      Number.isFinite(c.target),
  );
}

export function sumIncludedCategoryTargets(categories: CategoryDef[]): number | null {
  const withTargets = includedCategoriesWithTargets(categories);
  if (!withTargets.length) return null;
  return withTargets.reduce((sum, c) => sum + Math.max(0, Math.floor(Number(c.target))), 0);
}

/**
 * Header denominator for size display.
 * - Commander: never shown (use COMMANDER_DECK_TARGET for warnings only).
 * - Cube: sum of included category targets if any are set, else cubeTargetSize.
 */
export function deckHeaderTarget(
  deck: Pick<DeckDocument, 'format' | 'categories' | 'cubeTargetSize'>,
): number | null {
  if (deck.format === 'commander') return null;
  if (deck.format === 'cube') {
    const fromCats = sumIncludedCategoryTargets(deck.categories || []);
    if (fromCats != null) return fromCats;
    const cube = deck.cubeTargetSize;
    return cube != null && Number.isFinite(cube) && cube > 0 ? cube : null;
  }
  return null;
}

export function deckSizeMismatch(
  deck: Pick<DeckDocument, 'format' | 'cards' | 'categories' | 'cubeTargetSize'>,
): boolean {
  const size = deckSize(deck);
  if (deck.format === 'commander') return size !== COMMANDER_DECK_TARGET;
  const target = deckHeaderTarget(deck);
  return target != null && size !== target;
}

/** True when any included targets are set and their sum ≠ cubeTargetSize. */
export function categoryTargetsMismatchCubeSize(
  deck: Pick<DeckDocument, 'format' | 'categories' | 'cubeTargetSize'>,
): boolean {
  if (deck.format !== 'cube') return false;
  const sum = sumIncludedCategoryTargets(deck.categories || []);
  if (sum == null) return false;
  const cube = deck.cubeTargetSize;
  if (cube == null || !Number.isFinite(cube) || cube <= 0) return false;
  return sum !== cube;
}

/**
 * When setting the first target on any included category, seed other included
 * categories' targets with their current primary card counts.
 */
export function applyCategoryTargetWithSeed(
  deck: Pick<DeckDocument, 'cards' | 'categories'>,
  categoryName: string,
  target: number | null,
): CategoryDef[] {
  const categories = [...(deck.categories || [])];
  const canonicalName = canonicalizeCategoryName(categoryName);
  const included = categories.filter(
    (c) =>
      c.includedInDeck !== false &&
      !isHeaderCategory(c.name) &&
      !isSwapQueueCategory(c.name),
  );
  const anyTargetBefore = included.some(
    (c) => c.target != null && Number.isFinite(c.target),
  );

  const ensureDef = (name: string): void => {
    const key = canonicalizeCategoryName(name);
    if (!categories.some((c) => canonicalizeCategoryName(c.name) === key)) {
      categories.push({
        name: key,
        includedInDeck: true,
        includedInPrice: true,
        target: null,
      });
    }
  };
  ensureDef(canonicalName);

  const next = categories.map((c) =>
    canonicalizeCategoryName(c.name) === canonicalName
      ? { ...c, target: target == null ? null : Math.max(0, Math.floor(target)) }
      : c,
  );

  if (target == null || anyTargetBefore) return next;

  // First target set: seed every other included category with current primary N.
  return next.map((c) => {
    if (canonicalizeCategoryName(c.name) === canonicalName) return c;
    if (c.includedInDeck === false) return c;
    if (isHeaderCategory(c.name) || isSwapQueueCategory(c.name)) return c;
    if (c.target != null && Number.isFinite(c.target)) return c;
    return { ...c, target: primaryCategoryCount(deck.cards || [], c.name) };
  });
}

/** Reorder CategoryDef list; unknown names in `orderedNames` are ignored. */
export function reorderCategoryDefs(
  categories: CategoryDef[],
  orderedNames: string[],
): CategoryDef[] {
  const byName = new Map((categories || []).map((c) => [c.name, c]));
  const seen = new Set<string>();
  const next: CategoryDef[] = [];
  for (const name of orderedNames) {
    const def = byName.get(name);
    if (!def || seen.has(name)) continue;
    next.push(def);
    seen.add(name);
  }
  for (const c of categories || []) {
    if (!seen.has(c.name)) next.push(c);
  }
  return next;
}

/** Commander then Lieutenants, then remaining categories alphabetically. */
export function orderedCategoryKeys(groups: Record<string, CardInstance[]>): {
  header: string[];
  rest: string[];
} {
  const keys = Object.keys(groups);
  const header = (HEADER_CATEGORIES as readonly string[]).filter((k) => keys.includes(k));
  const rest = keys.filter((k) => !isHeaderCategory(k)).sort((a, b) => a.localeCompare(b));
  return { header, rest };
}

function sortKeysAlpha(keys: string[]): string[] {
  return [...keys].sort((a, b) => a.localeCompare(b));
}

function sortKeysCubeCi(keys: string[]): string[] {
  const order = cubeCategorySectionsOrder();
  const rank = new Map(order.map((name, i) => [name, i]));
  const known: string[] = [];
  const customs: string[] = [];
  for (const k of keys) {
    if (rank.has(k)) known.push(k);
    else customs.push(k);
  }
  known.sort((a, b) => (rank.get(a)! - rank.get(b)!));
  customs.sort((a, b) => a.localeCompare(b));
  return [...known, ...customs];
}

function sortKeysCustom(keys: string[], categoryOrder: string[]): string[] {
  const rank = new Map(categoryOrder.map((name, i) => [name, i]));
  const known: string[] = [];
  const orphans: string[] = [];
  for (const k of keys) {
    if (rank.has(k)) known.push(k);
    else orphans.push(k);
  }
  known.sort((a, b) => (rank.get(a)! - rank.get(b)!));
  orphans.sort((a, b) => a.localeCompare(b));
  return [...known, ...orphans];
}

export function sortCategoryKeys(
  keys: string[],
  sort: CategoryKeySort,
  categoryOrder: string[] = [],
): string[] {
  if (sort === 'cube_ci') return sortKeysCubeCi(keys);
  if (sort === 'custom') return sortKeysCustom(keys, categoryOrder);
  return sortKeysAlpha(keys);
}

/**
 * Partition cards for browse: header categories, included main columns, excluded (aside).
 * Queued In / Out are omitted by default (shown only via the formal swap queue).
 * Pass `includeSwapCategories: true` to surface them in the aside (swap edit pick mode).
 */
export function partitionCategories(
  deck: Pick<DeckDocument, 'cards' | 'categories'>,
  opts?: {
    includeSwapCategories?: boolean;
    /** When true, duplicate cards into every membership (Multiple categories browse). */
    multi?: boolean;
    keySort?: CategoryKeySort;
  },
): {
  header: Record<string, CategorizedCard[]>;
  included: Record<string, CategorizedCard[]>;
  excluded: Record<string, CategorizedCard[]>;
  headerKeys: string[];
  includedKeys: string[];
  excludedKeys: string[];
} {
  const multi = Boolean(opts?.multi);
  const keySort = opts?.keySort || 'alpha';
  const categoryOrder = (deck.categories || []).map((c) =>
    canonicalizeCategoryName(c.name),
  );

  const rawGroups = multi
    ? groupByAllCategories(deck.cards || [])
    : Object.fromEntries(
        Object.entries(groupByCategory(deck.cards || [])).map(([k, list]) => [
          k,
          list.map((c) => ({ ...c, membership: 'primary' as const })),
        ]),
      );

  const header: Record<string, CategorizedCard[]> = {};
  const included: Record<string, CategorizedCard[]> = {};
  const excluded: Record<string, CategorizedCard[]> = {};

  for (const [name, list] of Object.entries(rawGroups)) {
    if (isSwapQueueCategory(name)) {
      if (opts?.includeSwapCategories) {
        excluded[name] = list;
      }
      continue;
    }
    if (isHeaderCategory(name)) {
      header[name] = list;
    } else if (categoryIncluded(deck.categories || [], name)) {
      included[name] = list;
    } else {
      excluded[name] = list;
    }
  }

  // Empty defs with target > 0 still appear as drop sections (0/T).
  const presentKeys = new Set([
    ...Object.keys(header),
    ...Object.keys(included),
    ...Object.keys(excluded),
  ].map((k) => canonicalizeCategoryName(k)));
  for (const def of deck.categories || []) {
    const name = def.name;
    if (isSwapQueueCategory(name) || isHeaderCategory(name)) continue;
    const key = canonicalizeCategoryName(name);
    if (!key || presentKeys.has(key)) continue;
    const target = categoryTarget(deck.categories || [], name);
    if (target == null || target <= 0) continue;
    if (categoryIncluded(deck.categories || [], name)) {
      included[name] = [];
    } else {
      excluded[name] = [];
    }
    presentKeys.add(key);
  }

  const headerKeys = (HEADER_CATEGORIES as readonly string[]).filter((k) => header[k]?.length);
  const includedKeys = sortCategoryKeys(Object.keys(included), keySort, categoryOrder);
  const excludedKeys = sortCategoryKeys(Object.keys(excluded), keySort, categoryOrder);

  return { header, included, excluded, headerKeys, includedKeys, excludedKeys };
}
