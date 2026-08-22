import type { DeckDocument } from '../schemas/deck-builder.js';
import { cardImageUrl } from './scryfall-images.js';
import {
  isArthurCategory,
  isCommanderCategory,
  isExcaliburCategory,
  isPendragonLeaderCategory,
  pickCommanderLeaders,
} from './partner.js';
import { resolveDeckCards, type CardView } from './card-oracle.js';

type CoverDoc = Pick<DeckDocument, 'format' | 'cards' | 'coverInstanceId' | 'oracle'>;

function resolveCoverOverride(doc: CoverDoc): CardView | null {
  const id = doc.coverInstanceId;
  if (!id) return null;
  return resolveDeckCards(doc).find((c) => c.instanceId === id) ?? null;
}

function isLeaderCoverCategory(name: string | null | undefined): boolean {
  return isCommanderCategory(name) || isPendragonLeaderCategory(name);
}

/** Commander face for commander decks; first card for cubes (and other fallbacks). */
export function pickDeckCoverCard(doc: CoverDoc): CardView | null {
  const cards = pickDeckCoverCards(doc);
  return cards[0] ?? null;
}

/**
 * Cover faces for library tiles.
 * - Non-leader `coverInstanceId` → that face only.
 * - Commander override soft-selects the primary within its name group (partner
 *   secondary still shown when there are two distinct commander names).
 * - Same-name commander gallery → single primary face.
 * - Two distinct names → both primaries (+ partner status elsewhere).
 * - Pendragon → Arthur then Excalibur (no partner legality).
 */
export function pickDeckCoverCards(doc: CoverDoc): CardView[] {
  const cards = resolveDeckCards(doc);
  const override = resolveCoverOverride(doc);
  if (override && !isLeaderCoverCategory(override.primaryCategory)) {
    return [override];
  }

  if (doc.format === 'pendragon') {
    const arthur = cards.find((c) => isArthurCategory(c.primaryCategory));
    const excalibur = cards.find((c) => isExcaliburCategory(c.primaryCategory));
    const faces = [arthur, excalibur].filter((c): c is CardView => Boolean(c));
    if (override && isPendragonLeaderCategory(override.primaryCategory)) {
      const rest = faces.filter((c) => c.instanceId !== override.instanceId);
      return [override, ...rest];
    }
    return faces;
  }

  if (doc.format === 'commander') {
    const leaders = pickCommanderLeaders(cards, doc.coverInstanceId);
    if (leaders.kind === 'partner') {
      return leaders.primaries as [CardView, CardView];
    }
    if (leaders.kind === 'single' || leaders.kind === 'gallery') {
      return [leaders.primaries[0] as CardView];
    }
    if (leaders.kind === 'many' && leaders.groups.length) {
      return [leaders.groups[0]!.primary as CardView];
    }
  }
  return cards[0] ? [cards[0]] : [];
}

export function deckCoverImageUrl(doc: CoverDoc): string | null {
  const card = pickDeckCoverCard(doc);
  if (!card) return null;
  return cardImageUrl(card) || null;
}

export function deckCoverImageUrlSecondary(doc: CoverDoc): string | null {
  const cards = pickDeckCoverCards(doc);
  if (cards.length < 2) return null;
  return cardImageUrl(cards[1]) || null;
}

export function pickCoverPartnerStatus(doc: CoverDoc): 'legal' | 'illegal' | null {
  const override = resolveCoverOverride(doc);
  if (override && !isCommanderCategory(override.primaryCategory)) return null;
  if (doc.format !== 'commander') return null;
  const leaders = pickCommanderLeaders(resolveDeckCards(doc), doc.coverInstanceId);
  if (leaders.kind === 'partner') {
    if (leaders.partnerStatus === 'legal' || leaders.partnerStatus === 'illegal') {
      return leaders.partnerStatus;
    }
  }
  return null;
}
