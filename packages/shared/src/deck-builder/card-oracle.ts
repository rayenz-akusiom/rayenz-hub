import type {
  CardInstance,
  CardOracle,
  DeckDocument,
} from '../schemas/deck-builder.js';
import { normalizeColourIdentity, type ColourLetter } from './color-identity-map.js';
import { isHeaderLeaderCategory, parsePartnerWithName } from './partner.js';
import { provisionalLayoutFromCard, nameOrTypeLooksDual, scryfallImageFromId } from './scryfall-images.js';

/** UI / logic view: lean list card + resolved oracle fields. */
export type CardView = CardInstance & {
  colourIdentity: ColourLetter[];
  typeLine: string | null;
  layout: string | null;
  keywords: string[] | null;
  partnerWith: string | null;
  oracleText: string | null;
  printedName: string | null;
  flavorName: string | null;
  manaValue: number | null;
  imageUrl: string | null;
};

export type OracleKeyCard = Pick<
  CardInstance,
  'scryfallId' | 'setCode' | 'collectorNumber' | 'name'
>;

/** Print-keyed oracle map key (stable across re-import). */
export function oracleKey(card: OracleKeyCard): string {
  if (card.scryfallId) return `id:${String(card.scryfallId).toLowerCase()}`;
  if (card.setCode && card.collectorNumber != null && card.collectorNumber !== '') {
    return `print:${String(card.setCode).toLowerCase()}:${card.collectorNumber}`;
  }
  return `name:${String(card.name || '').toLowerCase()}`;
}

export function emptyCardOracle(over: Partial<CardOracle> = {}): CardOracle {
  return {
    scryfallId: null,
    colourIdentity: [],
    typeLine: null,
    layout: null,
    keywords: null,
    partnerWith: null,
    oracleText: null,
    printedName: null,
    flavorName: null,
    manaValue: null,
    imageUrl: null,
    finishes: null,
    updatedAt: null,
    ...over,
  };
}

export function getOracle(
  doc: Pick<DeckDocument, 'oracle'>,
  card: OracleKeyCard,
): CardOracle | undefined {
  return doc.oracle?.[oracleKey(card)];
}

export function resolveCardView(
  card: CardInstance,
  oracle: CardOracle | null | undefined,
): CardView {
  const o = oracle || emptyCardOracle();
  return {
    ...card,
    scryfallId: card.scryfallId || o.scryfallId || null,
    colourIdentity: o.colourIdentity?.length ? o.colourIdentity : [],
    typeLine: o.typeLine ?? null,
    layout: o.layout ?? provisionalLayoutFromCard(card.name, o.typeLine),
    keywords: o.keywords ?? null,
    partnerWith: o.partnerWith ?? null,
    oracleText: o.oracleText ?? null,
    printedName: o.printedName ?? null,
    flavorName: o.flavorName ?? null,
    manaValue: o.manaValue ?? null,
    imageUrl: o.imageUrl ?? null,
  };
}

/** Face name for display/sort: flavor → printed → canonical. */
export function cardDisplayName(
  card: Pick<CardView, 'name' | 'printedName' | 'flavorName'> | Pick<CardInstance, 'name'>,
): string {
  const flavor = 'flavorName' in card ? card.flavorName : null;
  const printed = 'printedName' in card ? card.printedName : null;
  return String(flavor || printed || card.name || '').trim() || String(card.name || '');
}

export function resolveDeckCards(doc: Pick<DeckDocument, 'cards' | 'oracle'>): CardView[] {
  const oracle = doc.oracle || {};
  return (doc.cards || []).map((c) => resolveCardView(c, oracle[oracleKey(c)]));
}

/** Dual-named type lines need an authoritative layout (not `//` guessing). */
function typeLineNeedsLayout(typeLine: string | null | undefined): boolean {
  return nameOrTypeLooksDual(null, typeLine);
}

/** Whether oracle entry is complete enough to skip Scryfall for this card. */
export function oracleSatisfiesCard(
  oracle: CardOracle | null | undefined,
  card: Pick<CardInstance, 'primaryCategory'>,
): boolean {
  if (!oracle) return false;
  if (!(oracle.colourIdentity && oracle.colourIdentity.length)) return false;
  if (!oracle.typeLine) return false;
  if (oracle.manaValue == null) return false;
  if (typeLineNeedsLayout(oracle.typeLine) && oracle.layout == null) return false;
  if (isHeaderLeaderCategory(card.primaryCategory) && oracle.keywords == null) return false;
  return true;
}

export function needsOracleEnrich(
  doc: Pick<DeckDocument, 'oracle'>,
  card: CardInstance,
): boolean {
  return !oracleSatisfiesCard(getOracle(doc, card), card);
}

type LegacyCard = CardInstance & {
  colourIdentity?: ColourLetter[];
  typeLine?: string | null;
  layout?: string | null;
  keywords?: string[] | null;
  partnerWith?: string | null;
};

function stripLegacy(card: LegacyCard): CardInstance {
  const {
    colourIdentity: _ci,
    typeLine: _tl,
    layout: _ly,
    keywords: _kw,
    partnerWith: _pw,
    ...lean
  } = card as LegacyCard & Record<string, unknown>;
  return lean as CardInstance;
}

function legacyOracleFromCard(card: LegacyCard): Partial<CardOracle> | null {
  const hasCi = Boolean(card.colourIdentity?.length);
  const hasType = Boolean(card.typeLine);
  const hasLayout = card.layout != null;
  const hasKw = card.keywords != null;
  const hasPw = card.partnerWith != null;
  if (!hasCi && !hasType && !hasLayout && !hasKw && !hasPw && !card.scryfallId) {
    return null;
  }
  return {
    scryfallId: card.scryfallId ?? null,
    colourIdentity: card.colourIdentity?.length ? [...card.colourIdentity] : [],
    typeLine: card.typeLine ?? null,
    layout:
      card.layout ??
      (nameOrTypeLooksDual(card.name, card.typeLine ?? null)
        ? null
        : provisionalLayoutFromCard(card.name, card.typeLine ?? null)),
    keywords: card.keywords ?? null,
    partnerWith: card.partnerWith ?? null,
    imageUrl: card.scryfallId ? scryfallImageFromId(card.scryfallId) : null,
  };
}

function mergeOraclePreferExisting(
  existing: CardOracle | undefined,
  incoming: Partial<CardOracle>,
): CardOracle {
  const base = existing || emptyCardOracle();
  const now = new Date().toISOString();
  return {
    scryfallId: base.scryfallId || incoming.scryfallId || null,
    colourIdentity:
      base.colourIdentity?.length
        ? base.colourIdentity
        : incoming.colourIdentity?.length
          ? incoming.colourIdentity
          : [],
    typeLine: base.typeLine || incoming.typeLine || null,
    // Prefer incoming so Scryfall can correct provisional/wrong layouts.
    layout: incoming.layout ?? base.layout ?? null,
    keywords: base.keywords ?? incoming.keywords ?? null,
    partnerWith: base.partnerWith ?? incoming.partnerWith ?? null,
    oracleText: base.oracleText ?? incoming.oracleText ?? null,
    printedName: base.printedName ?? incoming.printedName ?? null,
    flavorName: base.flavorName ?? incoming.flavorName ?? null,
    manaValue: base.manaValue ?? incoming.manaValue ?? null,
    imageUrl:
      base.imageUrl ||
      incoming.imageUrl ||
      (base.scryfallId || incoming.scryfallId
        ? scryfallImageFromId(base.scryfallId || incoming.scryfallId)
        : null),
    finishes: base.finishes ?? incoming.finishes ?? null,
    updatedAt: base.updatedAt || incoming.updatedAt || now,
  };
}

/** Upsert an oracle entry; returns a new oracle map. */
export function upsertOracle(
  oracle: Record<string, CardOracle> | undefined,
  key: string,
  incoming: Partial<CardOracle>,
): Record<string, CardOracle> {
  const next = { ...(oracle || {}) };
  next[key] = mergeOraclePreferExisting(next[key], {
    ...incoming,
    updatedAt: incoming.updatedAt || new Date().toISOString(),
  });
  return next;
}

/**
 * Migrate legacy on-card enrich fields into `oracle`, strip them from cards,
 * ensure imageUrl when scryfallId is known.
 * schemaVersion < 2: one-shot clear of dual type-line layouts so sticky
 * provisional `transform` is re-fetched from Scryfall.
 */
export function migrateDeckDocument<T extends Record<string, unknown>>(raw: T): T {
  if (!raw || typeof raw !== 'object') return raw;
  const cardsIn = Array.isArray(raw.cards) ? (raw.cards as LegacyCard[]) : [];
  let oracle: Record<string, CardOracle> = {
    ...((raw.oracle as Record<string, CardOracle>) || {}),
  };
  const prevVersion =
    typeof raw.schemaVersion === 'number' && Number.isFinite(raw.schemaVersion)
      ? raw.schemaVersion
      : 1;

  const cards: CardInstance[] = cardsIn.map((card) => {
    const legacy = legacyOracleFromCard(card);
    if (legacy) {
      const key = oracleKey(card);
      oracle = upsertOracle(oracle, key, legacy);
    } else if (card.scryfallId) {
      const key = oracleKey(card);
      const existing = oracle[key];
      if (!existing?.imageUrl) {
        oracle = upsertOracle(oracle, key, {
          scryfallId: card.scryfallId,
          imageUrl: scryfallImageFromId(card.scryfallId),
        });
      }
    }
    return stripLegacy(card);
  });

  // Ensure CDN imageUrl on every oracle row that has a scryfall id.
  for (const [key, entry] of Object.entries(oracle)) {
    if (entry.scryfallId && !entry.imageUrl) {
      oracle[key] = {
        ...entry,
        imageUrl: scryfallImageFromId(entry.scryfallId),
      };
    }
  }

  // One-shot: clear dual type-line layouts so wrong provisional transform is re-enriched.
  if (prevVersion < 2) {
    for (const [key, entry] of Object.entries(oracle)) {
      if (typeLineNeedsLayout(entry.typeLine) && entry.layout != null) {
        oracle[key] = { ...entry, layout: null };
      }
    }
  }

  return {
    ...raw,
    cards,
    oracle,
    schemaVersion: Math.max(prevVersion, 2),
  };
}

export function cardOracleFromScryfall(data: {
  id?: string;
  type_line?: string;
  color_identity?: string[];
  layout?: string;
  keywords?: string[];
  oracle_text?: string;
  printed_name?: string;
  flavor_name?: string;
  cmc?: number;
  finishes?: string[];
}): CardOracle {
  const keywords = Array.isArray(data.keywords) ? data.keywords.map(String) : [];
  const scryfallId = data.id || null;
  const finishes = Array.isArray(data.finishes) ? data.finishes.map(String) : null;
  return emptyCardOracle({
    scryfallId,
    typeLine: data.type_line || null,
    colourIdentity: normalizeColourIdentity(data.color_identity || []),
    layout: data.layout || 'normal',
    keywords,
    partnerWith: parsePartnerWithName(data.oracle_text),
    oracleText: data.oracle_text || null,
    printedName: data.printed_name?.trim() || null,
    flavorName: data.flavor_name?.trim() || null,
    manaValue: typeof data.cmc === 'number' && Number.isFinite(data.cmc) ? data.cmc : null,
    imageUrl: scryfallId ? scryfallImageFromId(scryfallId) : null,
    finishes: finishes?.length ? finishes : null,
    updatedAt: new Date().toISOString(),
  });
}
