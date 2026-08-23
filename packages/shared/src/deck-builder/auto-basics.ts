import type {
  CardInstance,
  DeckDocument,
} from '../schemas/deck-builder.js';
import {
  categoryIncluded,
} from './browse.js';
import { canonicalizeCategoryName } from './category-names.js';
import {
  addOrBumpBasicPrinting,
  deckCommanderColourLetters,
  listBasicLandStacks,
  setCardQuantity,
} from './card-edits.js';
import { getOracle, resolveDeckCards } from './card-oracle.js';
import type { ColourLetter } from './color-identity-map.js';
import { isCommandZoneFormat } from './format.js';
import { isLandType } from './glance/card-from-instance.js';
import { collectCommandZoneCards } from './partner.js';
import {
  basicLandDisplayName,
  basicLandTypeKey,
  isBasicLand,
} from './quantities.js';
import type { PrintingFields } from './scryfall-api.js';

export const DEFAULT_LAND_TARGET = 36;

const WUBRG: ColourLetter[] = ['W', 'U', 'B', 'R', 'G'];

const LETTER_TO_BASIC: Record<ColourLetter, string> = {
  W: 'Plains',
  U: 'Island',
  B: 'Swamp',
  R: 'Mountain',
  G: 'Forest',
};

const LETTER_TO_SNOW: Record<ColourLetter, string> = {
  W: 'Snow-Covered Plains',
  U: 'Snow-Covered Island',
  B: 'Snow-Covered Swamp',
  R: 'Snow-Covered Mountain',
  G: 'Snow-Covered Forest',
};

/** Parse Scryfall mana_cost into colored pip weights (hybrid = 0.5 each). */
export function parseManaCostPips(manaCost: string | null | undefined): Record<ColourLetter, number> {
  const counts: Record<ColourLetter, number> = { W: 0, U: 0, B: 0, R: 0, G: 0 };
  const raw = String(manaCost || '');
  const re = /\{([^}]+)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    const inner = m[1]!.toUpperCase().replace(/\s+/g, '');
    if (!inner || /^\d+$/.test(inner) || inner === 'X' || inner === 'Y' || inner === 'Z') {
      continue;
    }
    if (inner === 'C' || inner === 'S') continue;
    if (inner.includes('/')) {
      const parts = inner.split('/');
      const coloured = parts.filter((p) => WUBRG.includes(p as ColourLetter));
      if (!coloured.length) continue;
      // Phyrexian {W/P}: full pip. Hybrid / twobrid: split across faces.
      const share = parts.includes('P') && parts.length === 2 ? 1 : 1 / parts.length;
      for (const p of coloured) {
        counts[p as ColourLetter] += share;
      }
      continue;
    }
    // Phyrexian {W/P} handled above; bare {W} or {P} — P alone is generic.
    if (inner === 'P') continue;
    if (WUBRG.includes(inner as ColourLetter)) {
      counts[inner as ColourLetter] += 1;
    }
  }
  return counts;
}

export function landCategoryTarget(
  deck: Pick<DeckDocument, 'categories'>,
): number | null {
  const def = (deck.categories || []).find(
    (c) => canonicalizeCategoryName(c.name) === 'Land',
  );
  if (!def || def.target == null || !Number.isFinite(def.target)) return null;
  return Math.max(0, Math.floor(def.target));
}

export function ensureLandCategoryTarget(
  deck: DeckDocument,
  fallback = DEFAULT_LAND_TARGET,
): DeckDocument {
  const cats = [...(deck.categories || [])];
  const idx = cats.findIndex((c) => canonicalizeCategoryName(c.name) === 'Land');
  if (idx < 0) {
    cats.push({
      name: 'Land',
      includedInDeck: true,
      includedInPrice: true,
      target: fallback,
    });
    return { ...deck, categories: cats };
  }
  const cur = cats[idx]!;
  if (cur.target != null && Number.isFinite(cur.target)) return deck;
  cats[idx] = { ...cur, target: fallback };
  return { ...deck, categories: cats };
}

/** True when commanders are enriched and colour identity is empty (colourless). */
export function deckCommanderColourlessKnown(
  deck: Pick<DeckDocument, 'format' | 'cards' | 'oracle'>,
): boolean {
  if (!isCommandZoneFormat(deck.format)) return false;
  if (deckCommanderColourLetters(deck).length > 0) return false;
  const commanders = collectCommandZoneCards(resolveDeckCards(deck), deck.format);
  return commanders.some((c) => Boolean(c.scryfallId || c.typeLine));
}

function isIncludedMainboard(
  deck: Pick<DeckDocument, 'categories'>,
  card: Pick<CardInstance, 'primaryCategory'>,
): boolean {
  return categoryIncluded(deck.categories || [], card.primaryCategory || 'Other');
}

function emptyColourCounts(): Record<ColourLetter, number> {
  return { W: 0, U: 0, B: 0, R: 0, G: 0 };
}

function addCounts(
  into: Record<ColourLetter, number>,
  add: Record<ColourLetter, number>,
  mult = 1,
): void {
  for (const c of WUBRG) {
    into[c] += (add[c] || 0) * mult;
  }
}

function sumCounts(counts: Record<ColourLetter, number>, colours: ColourLetter[]): number {
  return colours.reduce((s, c) => s + (counts[c] || 0), 0);
}

function ratioError(
  sources: Record<ColourLetter, number>,
  demand: Record<ColourLetter, number>,
  colours: ColourLetter[],
): number {
  const totalS = sumCounts(sources, colours) || 1;
  const totalD = sumCounts(demand, colours) || 1;
  let err = 0;
  for (const c of colours) {
    err += Math.abs(sources[c] / totalS - demand[c] / totalD);
  }
  return err;
}

function producedManaCounts(
  produced: string[] | null | undefined,
): Record<ColourLetter, number> {
  const counts = emptyColourCounts();
  if (!produced?.length) return counts;
  for (const raw of produced) {
    const letter = String(raw || '').toUpperCase();
    if (WUBRG.includes(letter as ColourLetter)) {
      counts[letter as ColourLetter] += 1;
    }
  }
  return counts;
}

function basicColourLetter(name: string): ColourLetter | 'C' | null {
  const key = basicLandTypeKey(name);
  if (!key) return null;
  if (key === 'wastes') return 'C';
  if (key.includes('plains')) return 'W';
  if (key.includes('island')) return 'U';
  if (key.includes('swamp')) return 'B';
  if (key.includes('mountain')) return 'R';
  if (key.includes('forest')) return 'G';
  return null;
}

function preferredBasicName(
  letter: ColourLetter | 'C',
  existingStacks: CardInstance[],
): string {
  if (letter === 'C') return 'Wastes';
  const nonSnow = LETTER_TO_BASIC[letter];
  const snow = LETTER_TO_SNOW[letter];
  const keyNon = basicLandTypeKey(nonSnow);
  const keySnow = basicLandTypeKey(snow);
  let hasNon = false;
  let hasSnow = false;
  for (const c of existingStacks) {
    const key = basicLandTypeKey(c.name);
    if (key === keyNon) hasNon = true;
    if (key === keySnow) hasSnow = true;
  }
  if (hasNon || !hasSnow) return nonSnow;
  return snow;
}

function nameOnlyBasicPrinting(name: string): PrintingFields {
  const letter = basicColourLetter(name);
  const colourIdentity: ColourLetter[] =
    letter && letter !== 'C' ? [letter] : [];
  return {
    name: basicLandDisplayName(name),
    scryfallId: '',
    setCode: '',
    collectorNumber: '',
    typeLine: letter === 'C' ? 'Basic Land' : `Basic Land — ${basicLandDisplayName(name).replace(/^Snow-Covered /, '')}`,
    colourIdentity,
    layout: 'normal',
    foil: false,
    printedName: null,
    flavorName: null,
    manaValue: 0,
    manaCost: '',
    producedMana: letter && letter !== 'C' ? [letter] : letter === 'C' ? ['C'] : [],
  };
}

function typeQtyMap(stacks: CardInstance[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const c of stacks) {
    const key = basicLandTypeKey(c.name);
    if (!key) continue;
    map.set(key, (map.get(key) || 0) + Math.max(1, Number(c.quantity) || 1));
  }
  return map;
}

function applyBasicTotals(
  deck: DeckDocument,
  desiredByDisplayName: Map<string, number>,
): DeckDocument {
  let next = deck;
  const stacks = listBasicLandStacks(next);

  // Group stacks by type key
  const byKey = new Map<string, CardInstance[]>();
  for (const c of stacks) {
    const key = basicLandTypeKey(c.name);
    if (!key) continue;
    const list = byKey.get(key) || [];
    list.push(c);
    byKey.set(key, list);
  }

  const desiredKeys = new Map<string, number>();
  for (const [display, qty] of desiredByDisplayName) {
    const key = basicLandTypeKey(display);
    if (!key) continue;
    desiredKeys.set(key, (desiredKeys.get(key) || 0) + qty);
  }

  // Zero types not desired
  for (const [key, list] of byKey) {
    if (desiredKeys.has(key)) continue;
    for (const c of list) {
      next = setCardQuantity(next, c.instanceId, 0);
    }
  }

  for (const [key, desired] of desiredKeys) {
    const list = [...(byKey.get(key) || [])].sort(
      (a, b) =>
        Math.max(1, Number(b.quantity) || 1) - Math.max(1, Number(a.quantity) || 1) ||
        a.instanceId.localeCompare(b.instanceId),
    );
    const current = list.reduce((s, c) => s + Math.max(1, Number(c.quantity) || 1), 0);
    if (desired <= 0) {
      for (const c of list) {
        next = setCardQuantity(next, c.instanceId, 0);
      }
      continue;
    }
    if (!list.length) {
      const display =
        [...desiredByDisplayName.entries()].find(
          ([n]) => basicLandTypeKey(n) === key,
        )?.[0] || basicLandDisplayName(key);
      next = addOrBumpBasicPrinting(next, nameOnlyBasicPrinting(display), {
        quantity: desired,
      });
      continue;
    }
    if (current === desired) continue;

    if (current < desired) {
      const primary = list[0]!;
      const primaryQty = Math.max(1, Number(primary.quantity) || 1);
      next = setCardQuantity(next, primary.instanceId, primaryQty + (desired - current));
      continue;
    }

    // Reduce: keep as much as possible on largest stacks
    let remaining = desired;
    for (let i = 0; i < list.length; i++) {
      const c = list[i]!;
      if (remaining <= 0) {
        next = setCardQuantity(next, c.instanceId, 0);
        continue;
      }
      const cur = Math.max(1, Number(c.quantity) || 1);
      if (i === list.length - 1) {
        next = setCardQuantity(next, c.instanceId, remaining);
        remaining = 0;
      } else if (cur <= remaining) {
        remaining -= cur;
      } else {
        next = setCardQuantity(next, c.instanceId, remaining);
        remaining = 0;
      }
    }
  }

  return next;
}

export type RecalculateAutoBasicsOpts = { force?: boolean };

/**
 * Fill / redistribute basic lands so land count reaches the Land category target
 * and colored mana sources match pip demand as closely as possible.
 */
export function recalculateAutoBasics(
  deck: DeckDocument,
  opts?: RecalculateAutoBasicsOpts,
): DeckDocument {
  if (!isCommandZoneFormat(deck.format)) return deck;
  if (!opts?.force && !deck.autoAdjustBasics) return deck;

  const letters = deckCommanderColourLetters(deck);
  const colourless = deckCommanderColourlessKnown(deck);
  if (!letters.length && !colourless) return deck;

  let next = ensureLandCategoryTarget(deck);
  const target = landCategoryTarget(next) ?? DEFAULT_LAND_TARGET;

  const views = resolveDeckCards(next);
  const demand = emptyColourCounts();
  let nonBasicLands = 0;
  const supply = emptyColourCounts();

  for (const view of views) {
    if (!isIncludedMainboard(next, view)) continue;
    const qty = Math.max(1, Number(view.quantity) || 1);
    const basic = isBasicLand(view);
    const land = isLandType(view.typeLine, basic);

    if (basic) continue;

    if (land) {
      nonBasicLands += qty;
    } else {
      const pips = parseManaCostPips(getOracle(next, view)?.manaCost);
      addCounts(demand, pips, qty);
    }

    const produced = producedManaCounts(getOracle(next, view)?.producedMana);
    addCounts(supply, produced, qty);
  }

  const colours: ColourLetter[] = colourless ? [] : letters;
  // Restrict demand to CI colours
  if (colours.length) {
    for (const c of WUBRG) {
      if (!colours.includes(c)) demand[c] = 0;
    }
  }

  const budget = Math.max(0, target - nonBasicLands);
  const basics = emptyColourCounts();
  let wastes = 0;

  if (colourless) {
    wastes = budget;
  } else if (budget > 0) {
    const demandTotal = sumCounts(demand, colours);
    if (demandTotal <= 0) {
      // Even spread
      for (let i = 0; i < budget; i++) {
        basics[colours[i % colours.length]!] += 1;
      }
    } else {
      for (let i = 0; i < budget; i++) {
        let best: ColourLetter | null = null;
        let bestErr = Infinity;
        for (const c of colours) {
          const trial = { ...basics, [c]: basics[c] + 1 };
          const sources: Record<ColourLetter, number> = emptyColourCounts();
          for (const col of colours) {
            sources[col] = supply[col] + trial[col];
          }
          const err = ratioError(sources, demand, colours);
          if (err < bestErr - 1e-12 || (Math.abs(err - bestErr) < 1e-12 && best != null && c < best)) {
            bestErr = err;
            best = c;
          } else if (best == null) {
            bestErr = err;
            best = c;
          }
        }
        if (best) basics[best] += 1;
      }
    }
  }

  const existing = listBasicLandStacks(next);
  const desired = new Map<string, number>();
  if (colourless) {
    if (wastes > 0) desired.set('Wastes', wastes);
  } else {
    for (const c of colours) {
      const n = basics[c];
      if (n <= 0) continue;
      const name = preferredBasicName(c, existing);
      desired.set(name, (desired.get(name) || 0) + n);
    }
  }

  const before = typeQtyMap(listBasicLandStacks(next));
  const applied = applyBasicTotals(next, desired);
  const after = typeQtyMap(listBasicLandStacks(applied));
  if (before.size === after.size) {
    let same = true;
    for (const [k, v] of before) {
      if (after.get(k) !== v) {
        same = false;
        break;
      }
    }
    for (const [k, v] of after) {
      if (before.get(k) !== v) {
        same = false;
        break;
      }
    }
    if (same && landCategoryTarget(deck) != null) {
      // Categories unchanged and basics unchanged
      if (deck.categories === applied.categories) return deck;
      // Only target seed changed
      return applied;
    }
  }

  return {
    ...applied,
    updatedAt: new Date().toISOString(),
  };
}

export function includedLandCount(
  deck: Pick<DeckDocument, 'cards' | 'oracle' | 'categories'>,
): number {
  let n = 0;
  for (const view of resolveDeckCards(deck)) {
    if (!isIncludedMainboard(deck, view)) continue;
    const basic = isBasicLand(view);
    if (!isLandType(view.typeLine, basic)) continue;
    n += Math.max(1, Number(view.quantity) || 1);
  }
  return n;
}

/** Fingerprint of deck state that should trigger auto-basics (excludes basic stacks). */
export function autoBasicsTriggerFingerprint(
  deck: Pick<DeckDocument, 'cards' | 'oracle' | 'categories' | 'format' | 'autoAdjustBasics'>,
): string {
  const parts: string[] = [
    `auto:${deck.autoAdjustBasics ? 1 : 0}`,
    `land:${landCategoryTarget(deck) ?? 'x'}`,
    `ci:${deckCommanderColourLetters(deck).join('')}${deckCommanderColourlessKnown(deck) ? 'C' : ''}`,
  ];
  for (const c of [...(deck.cards || [])].sort((a, b) =>
    a.instanceId.localeCompare(b.instanceId),
  )) {
    if (isBasicLand(c)) continue;
    const o = getOracle(deck, c);
    parts.push(
      [
        c.instanceId,
        c.quantity,
        c.primaryCategory,
        c.name,
        o?.manaCost ?? '',
        (o?.producedMana || []).join(''),
        (o?.colourIdentity || []).join(''),
        o?.typeLine ?? '',
      ].join('|'),
    );
  }
  return parts.join('\n');
}

export function shouldRecalculateAutoBasics(
  prev: DeckDocument,
  next: DeckDocument,
): boolean {
  if (!isCommandZoneFormat(next.format)) return false;
  if (!next.autoAdjustBasics) return false;
  return autoBasicsTriggerFingerprint(prev) !== autoBasicsTriggerFingerprint(next);
}
