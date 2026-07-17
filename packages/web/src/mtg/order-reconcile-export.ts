import { SWAP_IN, SWAP_OUT, SwapQueue, isSwapQueueCategoryName } from '@rayenz-hub/shared';
import { ArchidektExport } from './archidekt-export';

const IN_CATEGORY = SWAP_IN;
const OUT_CATEGORY = SWAP_OUT;
const MAYBEBOARD_CATEGORY = 'Maybeboard';

type SnapshotCard = {
  name?: string;
  set_code?: string | null;
  collector_number?: string | null;
  quantity?: number;
  primary_category?: string;
  categories?: string[];
  finish?: string | null;
};

type DeckSnapshot = {
  cards?: SnapshotCard[];
  category_settings?: Record<string, { includedInDeck?: boolean; includedInPrice?: boolean }> | null;
};

type AcceptedItem = {
  status?: string;
  slot_key?: string;
  is_cube?: boolean;
  maybeboard_entry?: { name?: string };
  accepted?: {
    card_in: {
      name: string;
      set_code?: string | null;
      collector_number?: string | null;
      finish?: string | null;
    };
    destination_category?: string;
    quantity?: number;
    card_out?: {
      name?: string;
      set_code?: string | null;
      collector_number?: string | null;
    } | null;
  };
};

const buildMainDeckPool = ArchidektExport.buildMainDeckPool;
const addToLineMap = ArchidektExport.addToLineMap;
const lineMapToImportLines = ArchidektExport.lineMapToImportLines;

function isCubeDeck(deck: { deck_name?: string } | null | undefined): boolean {
  return /cube/i.test(String((deck && deck.deck_name) || ''));
}

function normalizeColorLetter(c: string): string | null {
  switch (String(c || '').trim().toLowerCase()) {
    case 'w':
    case 'white':
      return 'W';
    case 'u':
    case 'blue':
      return 'U';
    case 'b':
    case 'black':
      return 'B';
    case 'r':
    case 'red':
      return 'R';
    case 'g':
    case 'green':
      return 'G';
    default:
      return null;
  }
}

function cubeColorCategory(colorIdentity: string[]): string | null {
  const normalized = (colorIdentity || []).map(normalizeColorLetter).filter(Boolean) as string[];
  if (!normalized.length) {
    return 'Colorless';
  }
  if (normalized.length === 1) {
    switch (normalized[0]) {
      case 'W':
        return 'White';
      case 'U':
        return 'Blue';
      case 'B':
        return 'Black';
      case 'R':
        return 'Red';
      case 'G':
        return 'Green';
      default:
        return 'Colorless';
    }
  }
  if (normalized.length === 2) {
    const sorted = normalized.slice().sort();
    const pair = sorted.join('');
    switch (pair) {
      case 'UW':
        return 'Azorius';
      case 'UB':
        return 'Dimir';
      case 'BR':
        return 'Rakdos';
      case 'RG':
        return 'Gruul';
      case 'BG':
        return 'Golgari';
      case 'UR':
        return 'Izzet';
      case 'RW':
        return 'Boros';
      case 'GW':
        return 'Selesnya';
      case 'WB':
        return 'Orzhov';
      case 'UG':
        return 'Simic';
      default:
        return null;
    }
  }
  return null;
}

function resolveCubeDestinationCategory(snapshot: DeckSnapshot, colorIdentity: string[]): string {
  const suggested = cubeColorCategory(colorIdentity);
  if (!suggested) {
    return '';
  }
  const cats = deckCategories(snapshot);
  return cats.indexOf(suggested) >= 0 ? suggested : '';
}

function deriveMaybeboard(snapshot: DeckSnapshot | null | undefined): SnapshotCard[] {
  if (!snapshot || !Array.isArray(snapshot.cards)) {
    return [];
  }
  return snapshot.cards.filter((card) => {
    const primary = card.primary_category || (card.categories && card.categories[0]);
    return primary === MAYBEBOARD_CATEGORY;
  });
}

function maybeboardSlotKey(deckId: string, slotIndex: number, cardName: string): string {
  return deckId + ':mb:' + slotIndex + ':' + cardName;
}

function cardFaces(name: string): string[] {
  return String(name || '')
    .toLowerCase()
    .split('//')
    .map((s) => s.trim())
    .filter(Boolean);
}

function namesMatch(a: string, b: string): boolean {
  if (String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase()) {
    return true;
  }
  const fa = cardFaces(a);
  const fb = cardFaces(b);
  return fa.some((x) => fb.indexOf(x) >= 0);
}

function deriveSwapQueue(snapshot: DeckSnapshot | null | undefined) {
  const queue = SwapQueue.deriveSwapQueue({ deck_snapshot: snapshot });
  if (!queue) {
    return { new_set_in: [], new_set_out: [], metadata_flags: [] };
  }
  return {
    new_set_in: queue.new_set_in,
    new_set_out: queue.new_set_out,
    metadata_flags: queue.metadata_flags,
  };
}

function pairSwapSlots(newSetIn: SnapshotCard[], newSetOut: SnapshotCard[]) {
  const pairs: { in: SnapshotCard; out: SnapshotCard | null; index: number }[] = [];
  for (let i = 0; i < newSetIn.length; i++) {
    pairs.push({ in: newSetIn[i], out: newSetOut[i] || null, index: i });
  }
  return pairs;
}

function deckCategories(snapshot: DeckSnapshot): string[] {
  const cats: Record<string, boolean> = {};
  (snapshot.cards || []).forEach((card) => {
    const primary = card.primary_category || (card.categories && card.categories[0]);
    if (!primary || isSwapQueueCategoryName(primary)) {
      return;
    }
    cats[primary] = true;
  });
  return Object.keys(cats).sort();
}

type LineMapRow = {
  name: string;
  set_code?: string | null;
  collector_number?: string | null;
  categories?: string[];
  quantity: number;
};

type LineMap = Record<string, LineMapRow>;

function lineMapHasCategory(row: LineMapRow | null | undefined, categoryName: string): boolean {
  if (!row || !categoryName) {
    return false;
  }
  const cats = row.categories || [];
  return cats.indexOf(categoryName) >= 0;
}

function deductFromLineMap(
  map: LineMap,
  cut: { name: string; set_code?: string | null; collector_number?: string | null; quantity?: number },
  qty: number | undefined,
  excludeCategory: string | null | undefined,
): number {
  let remaining = qty || cut.quantity || 1;
  const keys = Object.keys(map);
  for (let i = 0; i < keys.length && remaining > 0; i++) {
    const row = map[keys[i]];
    if (excludeCategory && lineMapHasCategory(row, excludeCategory)) {
      continue;
    }
    if (row.name !== cut.name) {
      continue;
    }
    if (cut.set_code && row.set_code && row.set_code !== cut.set_code) {
      continue;
    }
    if (cut.collector_number && row.collector_number && row.collector_number !== cut.collector_number) {
      continue;
    }
    const take = Math.min(row.quantity, remaining);
    row.quantity -= take;
    remaining -= take;
    if (row.quantity <= 0) {
      delete map[keys[i]];
    }
  }
  return remaining;
}

function deductFromMaybeboard(
  map: LineMap,
  card: { name: string },
  qty: number | undefined,
): number {
  let remaining = qty || 1;
  const keys = Object.keys(map);
  for (let i = 0; i < keys.length && remaining > 0; i++) {
    const row = map[keys[i]];
    if (!lineMapHasCategory(row, MAYBEBOARD_CATEGORY)) {
      continue;
    }
    if (!namesMatch(row.name, card.name)) {
      continue;
    }
    const take = Math.min(row.quantity, remaining);
    row.quantity -= take;
    remaining -= take;
    if (row.quantity <= 0) {
      delete map[keys[i]];
    }
  }
  return remaining;
}

function fulfilledSlotKey(deckId: string, slotIndex: number, inName: string): string {
  return deckId + ':' + slotIndex + ':' + inName;
}

function buildReconcileDeckImport(
  deckId: string,
  snapshot: DeckSnapshot | null | undefined,
  acceptedItems: AcceptedItem[] | null | undefined,
  _allDeckItems: AcceptedItem[] | null | undefined,
  options?: { isProxyOrder?: boolean },
): string {
  const opts = options || {};
  const isProxyOrder = !!opts.isProxyOrder;
  if (!snapshot) {
    return '';
  }
  const queue = deriveSwapQueue(snapshot);
  const fulfilledSlotKeys: Record<string, boolean> = {};
  (acceptedItems || []).forEach((item) => {
    if (item.status === 'accepted' && item.slot_key) {
      fulfilledSlotKeys[item.slot_key] = true;
    }
  });

  const pool = buildMainDeckPool(snapshot);
  const categorySettings = snapshot.category_settings || null;
  const mainMap: LineMap = {};

  pool.forEach((entry) => {
    if (entry.quantity > 0) {
      addToLineMap(mainMap, entry, entry.categories, entry.quantity);
    }
  });

  (acceptedItems || []).forEach((item) => {
    if (item.status !== 'accepted' || !item.accepted) {
      return;
    }
    const a = item.accepted;
    let cardInCategories = ArchidektExport.normalizeCategories([a.destination_category].filter(Boolean) as string[], null);
    if (isProxyOrder) {
      cardInCategories = ArchidektExport.appendCategory(cardInCategories, 'Proxies');
    }
    addToLineMap(
      mainMap,
      {
        name: a.card_in.name,
        set_code: a.card_in.set_code,
        collector_number: a.card_in.collector_number,
        finish: a.card_in.finish || null,
      },
      cardInCategories,
      a.quantity || 1,
    );

    if (a.card_out && a.card_out.name) {
      deductFromLineMap(mainMap, a.card_out, a.quantity || 1, MAYBEBOARD_CATEGORY);
    }

    const mbRef = item.is_cube && item.maybeboard_entry ? item.maybeboard_entry : a.card_in;
    if (mbRef && mbRef.name) {
      deductFromMaybeboard(mainMap, mbRef, a.quantity || 1);
    }
  });

  const inMap: LineMap = {};
  const outMap: LineMap = {};
  pairSwapSlots(queue.new_set_in, queue.new_set_out).forEach((pair) => {
    const slotKey = fulfilledSlotKey(deckId, pair.index, pair.in.name || '');
    if (fulfilledSlotKeys[slotKey]) {
      return;
    }
    addToLineMap(inMap, pair.in, [IN_CATEGORY], pair.in.quantity || 1);
    if (pair.out) {
      addToLineMap(outMap, pair.out, [OUT_CATEGORY], pair.out.quantity || 1);
    }
  });

  const lines = lineMapToImportLines(mainMap, categorySettings)
    .concat(lineMapToImportLines(outMap, categorySettings))
    .concat(lineMapToImportLines(inMap, categorySettings));
  return lines.join('\n');
}

function buildStagingCleanupImport(
  snapshot: DeckSnapshot | null | undefined,
  removals: { name: string; set_code?: string | null; collector_number?: string | null; quantity?: number }[] | null | undefined,
): string {
  if (!snapshot) {
    return '';
  }
  const categorySettings = snapshot.category_settings || null;
  const map: LineMap = {};
  (snapshot.cards || []).forEach((card) => {
    const cats =
      card.categories && card.categories.length
        ? card.categories.slice()
        : ArchidektExport.normalizeCategories([], card.primary_category);
    addToLineMap(map, card, cats, card.quantity || 1);
  });

  (removals || []).forEach((rem) => {
    deductFromLineMap(map, rem, rem.quantity || 1, undefined);
  });

  return lineMapToImportLines(map, categorySettings).join('\n');
}

function deckReconcileComplete(
  items: { item_id?: string }[] | null | undefined,
  getDecisionFn: (id: unknown) => { status?: string } | null | undefined,
) {
  return ArchidektExport.isReviewComplete(items, 'item_id', getDecisionFn);
}

function summarizeDeck(
  deckId: string,
  snapshot: DeckSnapshot | null | undefined,
  acceptedItems: AcceptedItem[] | null | undefined,
  options?: { isCube?: boolean },
) {
  const opts = options || {};
  const isCube = !!opts.isCube;
  if (!snapshot) {
    return { ins: [], outs: [], remainingIn: [], remainingOut: [] };
  }
  const queue = deriveSwapQueue(snapshot);
  const fulfilledSlotKeys: Record<string, boolean> = {};
  const ins: {
    name: string;
    set_code?: string | null;
    collector_number?: string | null;
    finish?: string | null;
    category?: string;
  }[] = [];
  const outs: {
    name: string;
    set_code?: string | null;
    collector_number?: string | null;
  }[] = [];
  (acceptedItems || []).forEach((item) => {
    if (item.status !== 'accepted' || !item.accepted) {
      return;
    }
    if (item.slot_key) {
      fulfilledSlotKeys[item.slot_key] = true;
    }
    const a = item.accepted;
    ins.push({
      name: a.card_in.name,
      set_code: a.card_in.set_code,
      collector_number: a.card_in.collector_number,
      finish: a.card_in.finish || null,
      category: a.destination_category,
    });
    if (a.card_out && a.card_out.name) {
      outs.push({
        name: a.card_out.name,
        set_code: a.card_out.set_code,
        collector_number: a.card_out.collector_number,
      });
    }
  });
  const remainingIn: SnapshotCard[] = [];
  const remainingOut: SnapshotCard[] = [];
  if (isCube) {
    deriveMaybeboard(snapshot).forEach((entry, idx) => {
      const slotKey = maybeboardSlotKey(deckId, idx, entry.name || '');
      if (fulfilledSlotKeys[slotKey]) {
        return;
      }
      remainingIn.push(entry);
    });
  } else {
    pairSwapSlots(queue.new_set_in, queue.new_set_out).forEach((pair) => {
      const slotKey = fulfilledSlotKey(deckId, pair.index, pair.in.name || '');
      if (fulfilledSlotKeys[slotKey]) {
        return;
      }
      remainingIn.push(pair.in);
      if (pair.out) {
        remainingOut.push(pair.out);
      }
    });
  }
  return { ins, outs, remainingIn, remainingOut };
}

export const OrderReconcileExport = {
  IN_CATEGORY,
  OUT_CATEGORY,
  MAYBEBOARD_CATEGORY,
  isCubeDeck,
  cubeColorCategory,
  resolveCubeDestinationCategory,
  deriveMaybeboard,
  maybeboardSlotKey,
  cardFaces,
  namesMatch,
  deriveSwapQueue,
  pairSwapSlots,
  deckCategories,
  fulfilledSlotKey,
  buildReconcileDeckImport,
  buildStagingCleanupImport,
  deckReconcileComplete,
  summarizeDeck,
};
