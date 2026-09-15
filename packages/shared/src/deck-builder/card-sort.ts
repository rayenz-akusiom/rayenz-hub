import type { CardSortMode } from '../schemas/deck-builder.js';
import { cardDisplayName, type CardView } from './card-oracle.js';
import {
  colourIdentitySection,
  colourIdentitySectionsFor,
  type ColourIdentityOptionsInput,
} from './colour-identity.js';

export type { CardSortMode };

export const CARD_SORT_MODE_LABELS: Record<CardSortMode, string> = {
  name_asc: 'A–Z',
  name_desc: 'Z–A',
  colour_identity: 'Colour identity',
  mana_asc: 'Mana value ↑',
  mana_desc: 'Mana value ↓',
  collector_asc: 'Collector ↑',
  collector_desc: 'Collector ↓',
};

/** Canonical empty-set key for browse swimlanes and sort missing-set handling. */
export const UNKNOWN_SET_CODE_KEY = '—';

export function normalizeSetCodeKey(setCode: string | null | undefined): string {
  const trimmed = String(setCode || '').trim();
  if (!trimmed) return UNKNOWN_SET_CODE_KEY;
  return trimmed.toUpperCase();
}

function compareDisplayName(a: CardView, b: CardView): number {
  const cmp = cardDisplayName(a).localeCompare(cardDisplayName(b), undefined, {
    sensitivity: 'base',
  });
  if (cmp !== 0) return cmp;
  return String(a.instanceId).localeCompare(String(b.instanceId));
}

function colourIdentityRank(
  card: CardView,
  options?: ColourIdentityOptionsInput,
): number {
  const sections = colourIdentitySectionsFor(options);
  const section = colourIdentitySection(card, options);
  const idx = sections.indexOf(section);
  return idx >= 0 ? idx : sections.length;
}

function compareSetCode(a: CardView, b: CardView): number {
  const setA = normalizeSetCodeKey(a.setCode);
  const setB = normalizeSetCodeKey(b.setCode);
  const aMissing = setA === UNKNOWN_SET_CODE_KEY;
  const bMissing = setB === UNKNOWN_SET_CODE_KEY;
  if (aMissing !== bMissing) return aMissing ? 1 : -1;
  if (setA !== setB) return setA.localeCompare(setB);
  return 0;
}

function compareCollectorNumber(a: CardView, b: CardView, desc: boolean): number {
  const cnA = String(a.collectorNumber ?? '').trim();
  const cnB = String(b.collectorNumber ?? '').trim();
  const aMissing = !cnA;
  const bMissing = !cnB;
  if (aMissing !== bMissing) return aMissing ? 1 : -1;
  if (cnA !== cnB) {
    const cmp = cnA.localeCompare(cnB, undefined, { numeric: true });
    return desc ? -cmp : cmp;
  }
  return 0;
}

/**
 * Set code (A–Z, unknown last), then collector number (numeric, missing last),
 * then display name. Used by collector sort modes and Glance secondary compare.
 */
export function compareSetThenCollector(
  a: Pick<CardView, 'setCode' | 'collectorNumber' | 'instanceId'> & {
    name?: string | null;
    printedName?: string | null;
    flavorName?: string | null;
  },
  b: Pick<CardView, 'setCode' | 'collectorNumber' | 'instanceId'> & {
    name?: string | null;
    printedName?: string | null;
    flavorName?: string | null;
  },
  collectorDesc = false,
): number {
  const setCmp = compareSetCode(a as CardView, b as CardView);
  if (setCmp !== 0) return setCmp;
  const cnCmp = compareCollectorNumber(a as CardView, b as CardView, collectorDesc);
  if (cnCmp !== 0) return cnCmp;
  return compareDisplayName(a as CardView, b as CardView);
}

/**
 * Sort cards within a browse group. Missing mana / CI / set / collector sort last.
 * Stable ties: display name, then instanceId.
 * When `ghostIds` is set, those cards are stable-partitioned to the end (above placeholders).
 */
export function sortCardsInGroup(
  cards: CardView[],
  mode: CardSortMode,
  options?: ColourIdentityOptionsInput,
  ghostIds?: ReadonlySet<string> | null,
): CardView[] {
  const list = [...cards];
  list.sort((a, b) => {
    if (mode === 'name_asc') return compareDisplayName(a, b);
    if (mode === 'name_desc') return compareDisplayName(b, a);

    if (mode === 'colour_identity') {
      const ra = colourIdentityRank(a, options);
      const rb = colourIdentityRank(b, options);
      if (ra !== rb) return ra - rb;
      return compareDisplayName(a, b);
    }

    if (mode === 'collector_asc') return compareSetThenCollector(a, b, false);
    if (mode === 'collector_desc') return compareSetThenCollector(a, b, true);

    const aMana = a.manaValue;
    const bMana = b.manaValue;
    const aMissing = aMana == null;
    const bMissing = bMana == null;
    if (aMissing !== bMissing) return aMissing ? 1 : -1;
    if (!aMissing && !bMissing && aMana !== bMana) {
      return mode === 'mana_asc' ? aMana - bMana : bMana - aMana;
    }
    return compareDisplayName(a, b);
  });
  if (!ghostIds?.size) return list;
  const permanent: CardView[] = [];
  const ghosts: CardView[] = [];
  for (const card of list) {
    if (ghostIds.has(card.instanceId)) ghosts.push(card);
    else permanent.push(card);
  }
  return [...permanent, ...ghosts];
}
