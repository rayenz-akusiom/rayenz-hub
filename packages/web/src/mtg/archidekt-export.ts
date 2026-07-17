import {
  SWAP_IN,
  SWAP_OUT,
  SWAP_IN_LEGACY,
  SWAP_OUT_LEGACY,
  isSwapInCategory,
  isSwapOutCategory,
  isSwapQueueCategoryName,
} from '@rayenz-hub/shared';

const MANIFEST_VERSION = '1.1';
const IN_CATEGORY = SWAP_IN;
const OUT_CATEGORY = SWAP_OUT;
const APPLY_STORAGE_PREFIX = 'rayenz-deck-apply:';

type CategorySettings = Record<
  string,
  { includedInDeck?: boolean; includedInPrice?: boolean }
>;

type ParsedImportCard = {
  name: string;
  quantity: number;
  set_code: string | null;
  collector_number: string | null;
  finish: string | null;
  primary_category: string | null;
  categories: string[];
};

type PoolEntry = {
  name: string;
  set_code: string | null;
  collector_number: string | null;
  quantity: number;
  primary_category?: string;
  categories: string[];
  finish?: string | null;
};

type LineMapRow = {
  name: string;
  set_code: string | null;
  collector_number: string | null;
  categories: string[];
  finish: string | null;
  quantity: number;
};

type LineMap = Record<string, LineMapRow>;

type SwapDecision = {
  suggestion_id?: string;
  action?: string;
  quantity?: number;
  swap_categories?: boolean;
  card_in?: {
    name?: string;
    set_code?: string | null;
    collector_number?: string | null;
    finish?: string | null;
  };
  card_out?: {
    name?: string;
    set_code?: string | null;
    collector_number?: string | null;
    quantity?: number;
  };
};

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
  category_settings?: CategorySettings | null;
};

type DeckWithSnapshot = {
  deck_id?: string;
  archidekt_url?: string;
  deck_snapshot?: DeckSnapshot;
};

type ArchidektBridge = {
  stageApply?: (deckId: number, importText: string) => void;
  getStagedApply?: (deckId: number) => unknown;
  clearStagedApply?: (deckId: number) => void;
};

function parseDeckId(url: string | null | undefined): number | null {
  const match = String(url || '').match(/archidekt\.com\/decks\/(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

function buildCategorySettings(rawDeck: { categories?: { name?: string; includedInDeck?: boolean; includedInPrice?: boolean }[] }): CategorySettings {
  const map: CategorySettings = {};
  (rawDeck.categories || []).forEach((cat) => {
    if (!cat || !cat.name) {
      return;
    }
    map[cat.name] = {
      includedInDeck: cat.includedInDeck !== false,
      includedInPrice: cat.includedInPrice !== false,
    };
  });
  return map;
}

function getCategorySettings(categorySettings: CategorySettings | null | undefined, category: string): CategorySettings[string] | null {
  if (!category || !categorySettings) {
    return null;
  }
  const aliases = [category];
  if (isSwapInCategory(category)) {
    aliases.push(SWAP_IN, SWAP_IN_LEGACY);
  } else if (isSwapOutCategory(category)) {
    aliases.push(SWAP_OUT, SWAP_OUT_LEGACY);
  }
  for (const key of aliases) {
    if (categorySettings[key]) {
      return categorySettings[key];
    }
  }
  const lowerSet = new Set(aliases.map((a) => a.toLowerCase()));
  const keys = Object.keys(categorySettings);
  for (let i = 0; i < keys.length; i++) {
    if (lowerSet.has(keys[i].toLowerCase())) {
      return categorySettings[keys[i]];
    }
  }
  return null;
}

function formatSingleCategoryWithFlags(category: string, categorySettings: CategorySettings | null | undefined): string {
  if (!category) {
    return '';
  }
  let bracket = category;
  const settings = getCategorySettings(categorySettings, category);
  if (settings) {
    if (settings.includedInDeck === false) {
      bracket += '{noDeck}';
    }
    if (settings.includedInPrice === false) {
      bracket += '{noPrice}';
    }
  } else if (/^borrowed \(out\)$/i.test(category)) {
    bracket += '{noDeck}{noPrice}';
  } else if (isSwapInCategory(category) || /^maybeboard$/i.test(category)) {
    bracket += '{noDeck}{noPrice}';
  }
  return bracket;
}

function normalizeCategories(categories: string[] | null | undefined, primaryFallback: string | null | undefined): string[] {
  let list = Array.isArray(categories) ? categories.slice() : [];
  if (!list.length && primaryFallback) {
    list = [primaryFallback];
  }
  const seen: Record<string, boolean> = {};
  const out: string[] = [];
  list.forEach((cat) => {
    if (!cat || seen[cat]) {
      return;
    }
    seen[cat] = true;
    out.push(cat);
  });
  return out;
}

function formatCategoriesBracket(
  categories: string[] | null | undefined,
  _name: string,
  categorySettings: CategorySettings | null | undefined,
): string {
  const cats = normalizeCategories(categories, null);
  if (!cats.length) {
    return '';
  }
  const parts = cats
    .map((cat) => formatSingleCategoryWithFlags(cat, categorySettings))
    .filter(Boolean);
  if (!parts.length) {
    return '';
  }
  return ' [' + parts.join(',') + ']';
}

function formatCategoryBracket(
  category: string,
  name: string,
  categorySettings: CategorySettings | null | undefined,
): string {
  if (!category) {
    return '';
  }
  return formatCategoriesBracket([category], name, categorySettings);
}

function appendCategory(categories: string[] | null | undefined, name: string): string[] {
  return normalizeCategories((categories || []).concat([name]), null);
}

function formatFinishToken(finish: string | null | undefined): string {
  if (finish === 'foil') {
    return ' *F*';
  }
  if (finish === 'etched') {
    return ' *E*';
  }
  return '';
}

function formatImportLine(
  quantity: number,
  name: string,
  setCode: string | null | undefined,
  collectorNumber: string | null | undefined,
  categories: string | string[] | null | undefined,
  categorySettings: CategorySettings | null | undefined,
  finish: string | null | undefined,
): string {
  let line = quantity + 'x ' + name;
  if (setCode && collectorNumber) {
    line += ' (' + String(setCode).toLowerCase() + ') ' + collectorNumber;
  } else if (setCode) {
    line += ' (' + String(setCode).toLowerCase() + ')';
  }
  line += formatFinishToken(finish);
  const cats = Array.isArray(categories) ? categories : categories ? [categories] : [];
  line += formatCategoriesBracket(cats, name, categorySettings);
  return line;
}

function stripCategoryFlags(category: string): string {
  return String(category || '')
    .replace(/\{noDeck\}/gi, '')
    .replace(/\{noPrice\}/gi, '')
    .trim();
}

function parseCategoryList(bracketContent: string): string[] {
  return String(bracketContent || '')
    .split(',')
    .map(stripCategoryFlags)
    .filter(Boolean);
}

function parseImportLine(line: string): ParsedImportCard | null {
  let trimmed = String(line || '').trim();
  if (!trimmed || trimmed.charAt(0) === '#') {
    return null;
  }
  let categories: string[] = [];
  let primary_category: string | null = null;
  const bracketMatch = trimmed.match(/\s+\[([^\]]+)\]\s*$/);
  if (bracketMatch) {
    categories = parseCategoryList(bracketMatch[1]);
    primary_category = categories[0] || null;
    trimmed = trimmed.slice(0, bracketMatch.index).trim();
  }
  let finish: string | null = null;
  const finishMatch = trimmed.match(/\s+\*([FE])\*\s*$/i);
  if (finishMatch) {
    finish = finishMatch[1].toUpperCase() === 'F' ? 'foil' : 'etched';
    trimmed = trimmed.slice(0, finishMatch.index).trim();
  }
  let set_code: string | null = null;
  let collector_number: string | null = null;
  const printMatch = trimmed.match(/\s+\(([a-zA-Z0-9]+)\)(?:\s+(\S+))?\s*$/);
  if (printMatch) {
    set_code = printMatch[1].toLowerCase();
    collector_number = printMatch[2] || '';
    trimmed = trimmed.slice(0, printMatch.index).trim();
  }
  const qtyMatch = trimmed.match(/^(\d+)\s*x?\s+(.+)$/i);
  if (!qtyMatch) {
    throw new Error('Invalid import line: ' + line);
  }
  return {
    name: qtyMatch[2].trim(),
    quantity: parseInt(qtyMatch[1], 10) || 1,
    set_code,
    collector_number,
    finish,
    primary_category,
    categories: categories.length ? categories : primary_category ? [primary_category] : [],
  };
}

function parseImportText(text: string): ParsedImportCard[] {
  const cards: ParsedImportCard[] = [];
  String(text || '')
    .split(/\r?\n/)
    .forEach((line) => {
      const card = parseImportLine(line);
      if (card) {
        cards.push(card);
      }
    });
  if (!cards.length) {
    throw new Error('Paste at least one card import line.');
  }
  return cards;
}

function cardKey(name: string, setCode: string | null | undefined, collectorNumber: string | null | undefined): string {
  return [name, (setCode || '').toLowerCase(), collectorNumber || ''].join('|');
}

function clonePoolEntry(card: SnapshotCard & { finish?: string | null }): PoolEntry {
  const primary = card.primary_category || (card.categories && card.categories[0]);
  return {
    name: card.name || '',
    set_code: card.set_code || null,
    collector_number: card.collector_number || null,
    quantity: card.quantity || 1,
    primary_category: primary,
    categories:
      card.categories && card.categories.length
        ? card.categories.slice()
        : normalizeCategories([], primary),
  };
}

function buildMainDeckPool(snapshot: DeckSnapshot): PoolEntry[] {
  const pool: PoolEntry[] = [];
  (snapshot.cards || []).forEach((card) => {
    const primary = card.primary_category || (card.categories && card.categories[0]);
    if (isSwapQueueCategoryName(primary)) {
      return;
    }
    if (!card.name) {
      return;
    }
    pool.push(clonePoolEntry(card));
  });
  return pool;
}

function poolEntryMatchesCut(
  entry: PoolEntry,
  cut: { name: string; set_code?: string | null; collector_number?: string | null },
  exactOnly: boolean,
): boolean {
  if (entry.name !== cut.name) {
    return false;
  }
  if (exactOnly) {
    const cutSet = (cut.set_code || '').toLowerCase();
    const entrySet = (entry.set_code || '').toLowerCase();
    const cutNum = cut.collector_number || '';
    const entryNum = entry.collector_number || '';
    if (cutSet && entrySet && cutSet !== entrySet) {
      return false;
    }
    if (cutNum && entryNum && cutNum !== entryNum) {
      return false;
    }
    if (cutSet && entrySet && cutNum && entryNum) {
      return true;
    }
    if (cutSet && entrySet && !cutNum && !entryNum) {
      return true;
    }
    return !!(cutSet && entrySet);
  }
  return true;
}

function addToLineMap(
  map: LineMap,
  entry: {
    name: string;
    set_code?: string | null;
    collector_number?: string | null;
    primary_category?: string;
    categories?: string[];
    finish?: string | null;
  },
  categories: string[] | null | undefined,
  qty: number,
): void {
  if (qty <= 0) {
    return;
  }
  const cats = normalizeCategories(
    categories,
    entry.primary_category || (entry.categories && entry.categories[0]),
  );
  const finishKey = entry.finish || '';
  const key = cardKey(entry.name, entry.set_code, entry.collector_number) + '|' + cats.join(',') + '|' + finishKey;
  if (!map[key]) {
    map[key] = {
      name: entry.name,
      set_code: entry.set_code ?? null,
      collector_number: entry.collector_number ?? null,
      categories: cats,
      finish: entry.finish || null,
      quantity: 0,
    };
  }
  map[key].quantity += qty;
}

function deductCutFromPool(
  pool: PoolEntry[],
  cut: { name: string; set_code?: string | null; collector_number?: string | null; quantity?: number },
  outMap: LineMap,
): void {
  let remaining = cut.quantity || 1;
  const exactOnly = !!(cut.set_code || cut.collector_number);

  function tryDeduct(matchExact: boolean) {
    for (let i = 0; i < pool.length && remaining > 0; i++) {
      if (pool[i].quantity <= 0) {
        continue;
      }
      if (!poolEntryMatchesCut(pool[i], cut, matchExact)) {
        continue;
      }
      const take = Math.min(pool[i].quantity, remaining);
      pool[i].quantity -= take;
      addToLineMap(outMap, pool[i], [OUT_CATEGORY], take);
      remaining -= take;
    }
  }

  tryDeduct(true);
  if (remaining > 0 && !exactOnly) {
    tryDeduct(false);
  }

  if (remaining > 0) {
    addToLineMap(
      outMap,
      {
        name: cut.name,
        set_code: cut.set_code,
        collector_number: cut.collector_number,
      },
      [OUT_CATEGORY],
      remaining,
    );
  }
}

function collectSwapOperations(accepted: SwapDecision[] | null | undefined) {
  const ins: {
    name: string;
    set_code: string | null;
    collector_number: string | null;
    finish: string | null;
    quantity: number;
  }[] = [];
  const outs: {
    name: string;
    set_code: string | null;
    collector_number: string | null;
    quantity: number;
  }[] = [];
  (accepted || []).forEach((decision) => {
    if (!decision.swap_categories) {
      return;
    }
    const qty = decision.quantity || 1;
    const cardIn = decision.card_in || {};
    if (cardIn.name) {
      ins.push({
        name: cardIn.name,
        set_code: cardIn.set_code || null,
        collector_number: cardIn.collector_number || null,
        finish: cardIn.finish || null,
        quantity: qty,
      });
    }
    if (decision.card_out && decision.card_out.name) {
      outs.push({
        name: decision.card_out.name,
        set_code: decision.card_out.set_code || null,
        collector_number: decision.card_out.collector_number || null,
        quantity: decision.card_out.quantity || qty,
      });
    }
  });
  return { ins, outs };
}

function lineMapToImportLines(map: LineMap, categorySettings: CategorySettings | null | undefined): string[] {
  const lines: string[] = [];
  Object.keys(map).forEach((key) => {
    const row = map[key];
    if (row.quantity > 0) {
      lines.push(
        formatImportLine(
          row.quantity,
          row.name,
          row.set_code,
          row.collector_number,
          row.categories,
          categorySettings,
          row.finish,
        ),
      );
    }
  });
  return lines;
}

function appendAcceptedSwapLines(
  lines: string[],
  accepted: SwapDecision[] | null | undefined,
  categorySettings: CategorySettings | null | undefined,
): void {
  (accepted || []).forEach((decision) => {
    if (!decision.swap_categories) {
      return;
    }
    const qty = decision.quantity || 1;
    const cardIn = decision.card_in || {};
    if (cardIn.name) {
      lines.push(
        formatImportLine(
          qty,
          cardIn.name,
          cardIn.set_code,
          cardIn.collector_number,
          [IN_CATEGORY],
          categorySettings,
          cardIn.finish,
        ),
      );
    }
    if (decision.card_out && decision.card_out.name) {
      lines.push(
        formatImportLine(
          decision.card_out.quantity || qty,
          decision.card_out.name,
          decision.card_out.set_code,
          decision.card_out.collector_number,
          [OUT_CATEGORY],
          categorySettings,
        ),
      );
    }
  });
}

function buildImportTextForDeck(accepted: SwapDecision[] | null | undefined, categorySettings: CategorySettings | null | undefined): string {
  const lines: string[] = [];
  appendAcceptedSwapLines(lines, accepted, categorySettings);
  return lines.join('\n');
}

function buildTargetAcceptedSwaps(accepted: SwapDecision[] | null | undefined): SwapDecision[] {
  return (accepted || []).filter((d) => d && d.swap_categories !== false);
}

function isReviewComplete<T extends Record<string, unknown>>(
  list: T[] | null | undefined,
  idField: keyof T & string,
  getDecisionFn: (id: unknown) => { status?: string } | null | undefined,
) {
  const items = list || [];
  if (!items.length) {
    return { complete: true, reviewed: 0, total: 0 };
  }
  let reviewed = 0;
  for (let i = 0; i < items.length; i++) {
    const d = getDecisionFn(items[i][idField]);
    if (!d || !d.status) {
      return { complete: false, reviewed, total: items.length };
    }
    reviewed++;
  }
  return { complete: true, reviewed, total: items.length };
}

function deckReviewComplete(
  suggestions: { suggestion_id?: string }[] | null | undefined,
  getDecisionFn: (id: unknown) => { status?: string } | null | undefined,
) {
  return isReviewComplete(suggestions, 'suggestion_id', getDecisionFn);
}

function buildFullDeckImport(deck: DeckWithSnapshot, accepted: SwapDecision[] | null | undefined): string {
  const snapshot = deck && deck.deck_snapshot;
  if (!snapshot || !Array.isArray(snapshot.cards)) {
    return '';
  }
  const ops = collectSwapOperations(accepted);
  const pool = buildMainDeckPool(snapshot);
  const categorySettings = snapshot.category_settings || null;
  const outMap: LineMap = {};
  const inMap: LineMap = {};

  ops.outs.forEach((cut) => {
    deductCutFromPool(pool, cut, outMap);
  });

  ops.ins.forEach((add) => {
    addToLineMap(inMap, add, [IN_CATEGORY], add.quantity);
  });

  const mainMap: LineMap = {};
  pool.forEach((entry) => {
    if (entry.quantity > 0) {
      addToLineMap(mainMap, entry, entry.categories, entry.quantity);
    }
  });

  const lines = lineMapToImportLines(mainMap, categorySettings)
    .concat(lineMapToImportLines(outMap, categorySettings))
    .concat(lineMapToImportLines(inMap, categorySettings));
  return lines.join('\n');
}

function buildDeckApplyEntry(deck: DeckWithSnapshot, accepted: SwapDecision[] | null | undefined) {
  const acceptedSwaps = buildTargetAcceptedSwaps(accepted);
  const importText = buildFullDeckImport(deck, acceptedSwaps);
  if (!importText.trim()) {
    return null;
  }
  const deckId = parseDeckId(deck.archidekt_url);
  return {
    deck_id: deck.deck_id,
    archidekt_deck_id: deckId,
    archidekt_url: deck.archidekt_url,
    import_mode: 'full_deck_replace',
    import_text: importText,
    operations: acceptedSwaps.map((d) => ({
      suggestion_id: d.suggestion_id,
      action: d.action,
      quantity: d.quantity || 1,
      card_in: d.card_in,
      card_out: d.card_out,
      swap_categories: d.swap_categories !== false,
    })),
  };
}

function buildApplyManifest(
  fileMeta: { set_code?: string; set_name?: string },
  decks: DeckWithSnapshot[] | null | undefined,
  acceptedByDeckId: Record<string, SwapDecision[] | undefined> | null | undefined,
) {
  const deckList = decks || [];
  const acceptedMap = acceptedByDeckId || {};
  return {
    apply_manifest_version: MANIFEST_VERSION,
    generated_at: new Date().toISOString(),
    set_code: fileMeta.set_code,
    set_name: fileMeta.set_name,
    decks: deckList
      .map((deck) => {
        const accepted = acceptedMap[deck.deck_id || ''] || [];
        return buildDeckApplyEntry(deck, accepted);
      })
      .filter(Boolean),
  };
}

function getArchidektBridge(): ArchidektBridge | undefined {
  return (window as Window & { RayenzArchidektBridge?: ArchidektBridge }).RayenzArchidektBridge;
}

function stageDeckApply(archidektDeckId: number, importText: string): void {
  if (!archidektDeckId || !importText) {
    throw new Error('Missing deck id or import text');
  }
  const bridge = getArchidektBridge();
  if (bridge && typeof bridge.stageApply === 'function') {
    bridge.stageApply(archidektDeckId, importText);
    return;
  }
  throw new Error('Install/update Archidekt Deck Review Bridge userscript to apply from Hub.');
}

function getStagedDeckApply(archidektDeckId: number): unknown {
  const bridge = getArchidektBridge();
  if (bridge && typeof bridge.getStagedApply === 'function') {
    return bridge.getStagedApply(archidektDeckId);
  }
  return null;
}

function clearStagedDeckApply(archidektDeckId: number): void {
  const bridge = getArchidektBridge();
  if (bridge && typeof bridge.clearStagedApply === 'function') {
    bridge.clearStagedApply(archidektDeckId);
  }
}

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
}

export const ArchidektExport = {
  MANIFEST_VERSION,
  IN_CATEGORY,
  OUT_CATEGORY,
  APPLY_STORAGE_PREFIX,
  parseDeckId,
  formatImportLine,
  parseImportLine,
  parseImportText,
  formatFinishToken,
  formatCategoryBracket,
  formatCategoriesBracket,
  normalizeCategories,
  appendCategory,
  buildCategorySettings,
  cardKey,
  buildMainDeckPool,
  addToLineMap,
  lineMapToImportLines,
  isReviewComplete,
  buildImportTextForDeck,
  buildTargetAcceptedSwaps,
  deckReviewComplete,
  buildFullDeckImport,
  buildDeckApplyEntry,
  buildApplyManifest,
  stageDeckApply,
  getStagedDeckApply,
  clearStagedDeckApply,
  copyText,
};
