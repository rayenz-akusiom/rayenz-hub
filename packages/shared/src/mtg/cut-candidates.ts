import { optionKey } from './option-key';
import {
  deriveSwapQueue,
  SWAP_IN,
  SWAP_OUT,
  SWAP_IN_LEGACY,
  SWAP_OUT_LEGACY,
  type DeckSnapshot,
  type SnapshotCard,
} from './swap-queue';

export const PROTECTED_CATEGORIES: Record<string, boolean> = {
  Commander: true,
  Lieutenant: true,
  Lieutenants: true,
};

export type CutCandidate = {
  name: string;
  quantity: number;
  set_code?: string;
  collector_number?: string;
  primary_category?: string;
};

export type BuildCutCandidatesOptions = {
  excludeCategories?: Record<string, boolean>;
  excludeMaybeboard?: boolean;
  includeOutQueue?: boolean;
  outQueueFallback?: boolean;
  outQueueCategory?: string;
  categoryFilter?: string | null;
  extraCards?: SnapshotCard[];
  sortByName?: boolean;
};

function resolveSnapshot(snapshotOrDeck: DeckSnapshot | { deck_snapshot?: DeckSnapshot } | null): DeckSnapshot | null {
  if (!snapshotOrDeck) {
    return null;
  }
  if ('deck_snapshot' in snapshotOrDeck && snapshotOrDeck.deck_snapshot) {
    return snapshotOrDeck.deck_snapshot;
  }
  return snapshotOrDeck as DeckSnapshot;
}

function cardPrimary(card: SnapshotCard): string | undefined {
  return card.primary_category || (card.categories && card.categories[0]);
}

function buildExcludeMap(options: BuildCutCandidatesOptions): Record<string, boolean> {
  if (options.excludeCategories) {
    return options.excludeCategories;
  }
  const excluded: Record<string, boolean> = {};
  excluded[SWAP_IN] = true;
  excluded[SWAP_OUT] = true;
  excluded[SWAP_IN_LEGACY] = true;
  excluded[SWAP_OUT_LEGACY] = true;
  Object.keys(PROTECTED_CATEGORIES).forEach((key) => {
    excluded[key] = true;
  });
  if (options.excludeMaybeboard) {
    excluded.Maybeboard = true;
  }
  return excluded;
}

function addOption(
  seen: Record<string, boolean>,
  options: CutCandidate[],
  card: SnapshotCard | null | undefined,
  primary?: string,
): void {
  if (!card || !card.name) {
    return;
  }
  const opt: CutCandidate = {
    name: card.name,
    quantity: 1,
    set_code: card.set_code,
    collector_number: card.collector_number,
    primary_category: primary !== undefined ? primary : cardPrimary(card),
  };
  const key = optionKey(opt);
  if (seen[key]) {
    return;
  }
  seen[key] = true;
  options.push(opt);
}

function scanMainDeck(
  snapshot: DeckSnapshot,
  excluded: Record<string, boolean>,
  categoryFilter: string | null,
  seen: Record<string, boolean>,
  options: CutCandidate[],
): number {
  const before = options.length;
  (snapshot.cards || []).forEach((card) => {
    const primary = cardPrimary(card);
    if (primary && excluded[primary]) {
      return;
    }
    if (categoryFilter && primary !== categoryFilter) {
      return;
    }
    addOption(seen, options, card, primary);
  });
  return options.length - before;
}

function addOutQueue(
  snapshot: DeckSnapshot,
  seen: Record<string, boolean>,
  options: CutCandidate[],
  outCategory?: string,
): void {
  const queue = deriveSwapQueue({ deck_snapshot: snapshot });
  if (!queue) {
    return;
  }
  (queue.new_set_out || []).forEach((card) => {
    addOption(seen, options, card, outCategory || SWAP_OUT);
  });
}

export function buildCutCandidates(
  snapshotOrDeck: DeckSnapshot | { deck_snapshot?: DeckSnapshot } | null,
  options: BuildCutCandidatesOptions = {},
): CutCandidate[] {
  const snapshot = resolveSnapshot(snapshotOrDeck);
  if (!snapshot || !Array.isArray(snapshot.cards)) {
    return [];
  }

  const excluded = buildExcludeMap(options);
  const seen: Record<string, boolean> = {};
  const result: CutCandidate[] = [];

  if (options.includeOutQueue) {
    addOutQueue(snapshot, seen, result, options.outQueueCategory);
  }

  const mainAdded = scanMainDeck(snapshot, excluded, options.categoryFilter || null, seen, result);

  if (options.outQueueFallback && mainAdded === 0) {
    addOutQueue(snapshot, seen, result, options.outQueueCategory || SWAP_OUT);
  }

  if (options.extraCards && options.extraCards.length) {
    options.extraCards.forEach((card) => {
      addOption(seen, result, card, card.primary_category);
    });
  }

  if (options.sortByName) {
    result.sort((a, b) => a.name.localeCompare(b.name));
  }

  return result;
}

export const CutCandidates = {
  PROTECTED_CATEGORIES,
  SWAP_IN,
  SWAP_OUT,
  buildCutCandidates,
};
