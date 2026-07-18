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
};

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

/**
 * Sort cards within a browse group. Missing mana / CI sort last.
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
