import type { CardInstance, DeckDocument } from '../schemas/deck-builder.js';
import { PROXIES_CATEGORY } from '../deck-builder/card-edits.js';
import { applyFormalSwapsToCards } from '../deck-builder/formal-swaps.js';
import { applyLookingForToCards } from '../deck-builder/looking-for.js';
import {
  SEEKING,
  SWAP_IN,
  SWAP_IN_LEGACY,
  SWAP_OUT,
  SWAP_OUT_LEGACY,
  canonicalizeSwapCategory,
  isSeekingCategory,
  isSwapInCategory,
  isSwapOutCategory,
} from './swap-queue.js';

export type ArchidektCategorySettings = Record<
  string,
  { includedInDeck?: boolean; includedInPrice?: boolean }
>;

export type ParsedArchidektImportCard = {
  name: string;
  quantity: number;
  set_code: string | null;
  collector_number: string | null;
  finish: string | null;
  primary_category: string | null;
  categories: string[];
};

export function buildCategorySettings(rawDeck: {
  categories?: { name?: string; includedInDeck?: boolean; includedInPrice?: boolean }[];
}): ArchidektCategorySettings {
  const map: ArchidektCategorySettings = {};
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

function getCategorySettings(
  categorySettings: ArchidektCategorySettings | null | undefined,
  category: string,
): ArchidektCategorySettings[string] | null {
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

function formatSingleCategoryWithFlags(
  category: string,
  categorySettings: ArchidektCategorySettings | null | undefined,
): string {
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
  } else if (
    isSwapInCategory(category) ||
    isSeekingCategory(category) ||
    /^maybeboard$/i.test(category)
  ) {
    bracket += '{noDeck}{noPrice}';
  }
  return bracket;
}

export function normalizeCategories(
  categories: string[] | null | undefined,
  primaryFallback: string | null | undefined,
): string[] {
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

export function formatCategoriesBracket(
  categories: string[] | null | undefined,
  _name: string,
  categorySettings: ArchidektCategorySettings | null | undefined,
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

export function formatCategoryBracket(
  category: string,
  name: string,
  categorySettings: ArchidektCategorySettings | null | undefined,
): string {
  if (!category) {
    return '';
  }
  return formatCategoriesBracket([category], name, categorySettings);
}

export function appendCategory(categories: string[] | null | undefined, name: string): string[] {
  return normalizeCategories((categories || []).concat([name]), null);
}

export function formatFinishToken(finish: string | null | undefined): string {
  if (finish === 'foil') {
    return ' *F*';
  }
  if (finish === 'etched') {
    return ' *E*';
  }
  return '';
}

export function formatImportLine(
  quantity: number,
  name: string,
  setCode: string | null | undefined,
  collectorNumber: string | null | undefined,
  categories: string | string[] | null | undefined,
  categorySettings: ArchidektCategorySettings | null | undefined,
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

export function parseImportLine(line: string): ParsedArchidektImportCard | null {
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

export function parseImportText(text: string): ParsedArchidektImportCard[] {
  const cards: ParsedArchidektImportCard[] = [];
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

function categoriesForCard(card: CardInstance): string[] {
  let cats = normalizeCategories(
    card.categories,
    canonicalizeSwapCategory(card.primaryCategory || 'Main'),
  ).map((c) => canonicalizeSwapCategory(c));
  if (card.proxy) {
    cats = appendCategory(cats, PROXIES_CATEGORY);
  }
  return cats;
}

/** Build Archidekt replace-deck import text from a Hub deck document (per-line categories). */
export function buildArchidektImportText(doc: DeckDocument): string {
  let cards = applyFormalSwapsToCards(doc.cards, doc.formalSwapEntries, doc.format);
  cards = applyLookingForToCards(cards, doc.lookingForEntries || [], doc.format);
  const categorySettings = buildCategorySettings(doc);
  if ((doc.lookingForEntries || []).length && !categorySettings[SEEKING]) {
    categorySettings[SEEKING] = { includedInDeck: false, includedInPrice: false };
  }
  if (cards.some((c) => c.proxy) && !categorySettings[PROXIES_CATEGORY]) {
    categorySettings[PROXIES_CATEGORY] = { includedInDeck: true, includedInPrice: false };
  }

  const byCat: Record<string, CardInstance[]> = {};
  for (const card of cards) {
    const key = canonicalizeSwapCategory(card.primaryCategory || 'Main');
    if (!byCat[key]) byCat[key] = [];
    byCat[key].push(card);
  }

  const order = [
    ...doc.categories.map((c) => canonicalizeSwapCategory(c.name)),
    ...Object.keys(byCat),
  ].filter((name) => name !== PROXIES_CATEGORY);

  const lines: string[] = [];
  const seen = new Set<string>();
  for (const cat of order) {
    if (seen.has(cat) || !byCat[cat]?.length) continue;
    seen.add(cat);
    if (lines.length) lines.push('');
    for (const card of byCat[cat]) {
      lines.push(
        formatImportLine(
          card.quantity || 1,
          card.name,
          card.setCode,
          card.collectorNumber,
          categoriesForCard(card),
          categorySettings,
          card.foil ? 'foil' : null,
        ),
      );
    }
  }
  return lines.join('\n').trim() + '\n';
}
