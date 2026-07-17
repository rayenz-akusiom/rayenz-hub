/** Canonical Archidekt swap-queue category names (Hub write/export). */
export const SWAP_IN = 'Queued In';
export const SWAP_OUT = 'Queued Out';

/** Legacy Archidekt names — still accepted when reading decks/snapshots. */
export const SWAP_IN_LEGACY = 'New Set In';
export const SWAP_OUT_LEGACY = 'New Set Out';

export type SnapshotCard = {
  name: string;
  primary_category?: string;
  categories?: string[];
  set_code?: string;
  collector_number?: string;
  [key: string]: unknown;
};

export type DeckSnapshot = {
  cards?: SnapshotCard[];
  fetched_at?: string | null;
  [key: string]: unknown;
};

export type DeckWithSnapshot = {
  deck_snapshot?: DeckSnapshot | null;
  [key: string]: unknown;
};

export type SwapQueueResult = {
  new_set_in: SnapshotCard[];
  new_set_out: SnapshotCard[];
  metadata_flags: string[];
  fetched_at: string | null;
};

export function isSwapInCategory(name: string | null | undefined): boolean {
  const n = String(name || '');
  return n === SWAP_IN || n === SWAP_IN_LEGACY;
}

export function isSwapOutCategory(name: string | null | undefined): boolean {
  const n = String(name || '');
  return n === SWAP_OUT || n === SWAP_OUT_LEGACY;
}

export function isSwapQueueCategoryName(name: string | null | undefined): boolean {
  return isSwapInCategory(name) || isSwapOutCategory(name);
}

/** Map legacy New Set In/Out → Queued In/Out; leave other names unchanged. */
export function canonicalizeSwapCategory(name: string): string {
  if (isSwapInCategory(name)) return SWAP_IN;
  if (isSwapOutCategory(name)) return SWAP_OUT;
  return name;
}

export function deriveSwapQueue(deck: DeckWithSnapshot): SwapQueueResult | null {
  if (!deck.deck_snapshot || !Array.isArray(deck.deck_snapshot.cards)) {
    return null;
  }
  const newSetIn: SnapshotCard[] = [];
  const newSetOut: SnapshotCard[] = [];
  const metadataFlags: string[] = [];
  deck.deck_snapshot.cards.forEach((card) => {
    const primary = card.primary_category || (card.categories && card.categories[0]);
    const cats = card.categories || [];
    if (isSwapInCategory(primary)) {
      newSetIn.push(card);
    }
    if (isSwapOutCategory(primary)) {
      newSetOut.push(card);
    }
    if (cats.some((c) => isSwapInCategory(c)) && !isSwapInCategory(primary)) {
      metadataFlags.push(card.name + ' (primary: ' + primary + ')');
    }
    if (cats.some((c) => isSwapOutCategory(c)) && !isSwapOutCategory(primary)) {
      metadataFlags.push(card.name + ' (primary: ' + primary + ')');
    }
  });
  return {
    new_set_in: newSetIn,
    new_set_out: newSetOut,
    metadata_flags: metadataFlags,
    fetched_at: deck.deck_snapshot.fetched_at || null,
  };
}

export function swapQueueHasName(cards: SnapshotCard[] | undefined, name: string): boolean {
  return (cards || []).some((c) => c.name === name);
}

export function hasMaybeboardOnlySwapQueue(snapshot: DeckSnapshot | null | undefined): boolean {
  if (!snapshot || !Array.isArray(snapshot.cards)) {
    return false;
  }
  let hasPrimaryInOut = false;
  let hasMaybeboardInOut = false;
  snapshot.cards.forEach((card) => {
    const primary = card.primary_category || (card.categories && card.categories[0]);
    const cats = card.categories || [];
    if (isSwapInCategory(primary) || isSwapOutCategory(primary)) {
      hasPrimaryInOut = true;
    }
    if (
      cats.indexOf('Maybeboard') >= 0 &&
      cats.some((c) => isSwapInCategory(c) || isSwapOutCategory(c))
    ) {
      hasMaybeboardInOut = true;
    }
  });
  return hasMaybeboardInOut && !hasPrimaryInOut;
}

export const SwapQueue = {
  SWAP_IN,
  SWAP_OUT,
  SWAP_IN_LEGACY,
  SWAP_OUT_LEGACY,
  isSwapInCategory,
  isSwapOutCategory,
  isSwapQueueCategoryName,
  canonicalizeSwapCategory,
  deriveSwapQueue,
  swapQueueHasName,
  hasMaybeboardOnlySwapQueue,
};
