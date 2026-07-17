export const SWAP_IN = 'New Set In';
export const SWAP_OUT = 'New Set Out';

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
    if (primary === SWAP_IN) {
      newSetIn.push(card);
    }
    if (primary === SWAP_OUT) {
      newSetOut.push(card);
    }
    if (cats.indexOf(SWAP_IN) >= 0 && primary !== SWAP_IN) {
      metadataFlags.push(card.name + ' (primary: ' + primary + ')');
    }
    if (cats.indexOf(SWAP_OUT) >= 0 && primary !== SWAP_OUT) {
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
    if (primary === SWAP_IN || primary === SWAP_OUT) {
      hasPrimaryInOut = true;
    }
    if (
      cats.indexOf('Maybeboard') >= 0 &&
      (cats.indexOf(SWAP_IN) >= 0 || cats.indexOf(SWAP_OUT) >= 0)
    ) {
      hasMaybeboardInOut = true;
    }
  });
  return hasMaybeboardInOut && !hasPrimaryInOut;
}

export const SwapQueue = {
  SWAP_IN,
  SWAP_OUT,
  deriveSwapQueue,
  swapQueueHasName,
  hasMaybeboardOnlySwapQueue,
};
