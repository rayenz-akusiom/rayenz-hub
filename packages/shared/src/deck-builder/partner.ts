import type { CardInstance } from '../schemas/deck-builder.js';

/** Categories that appear in the deck header (not all are commanders). */
export const HEADER_LEADER_CATEGORIES = ['Commander', 'Lieutenants'] as const;

export type CommanderPairStatus = 'legal' | 'illegal' | 'unknown' | 'single' | 'none' | 'many';

export type CommanderPairResult =
  | { status: 'none'; a?: undefined; b?: undefined }
  | { status: 'single'; a: CardInstance; b?: undefined }
  | { status: 'many'; a?: undefined; b?: undefined }
  | { status: 'legal' | 'illegal' | 'unknown'; a: CardInstance; b: CardInstance };

/** Parse "Partner with Name" from oracle text. */
export function parsePartnerWithName(oracleText: string | null | undefined): string | null {
  if (!oracleText) return null;
  const m = oracleText.match(/Partner with ([^\n(]+)/i);
  if (!m) return null;
  return m[1].trim().replace(/\s+/g, ' ') || null;
}

export function isCommanderCategory(name: string | null | undefined): boolean {
  return String(name || '') === 'Commander';
}

/** Header categories that may need keyword enrich (Commander + Lieutenants). */
export function isHeaderLeaderCategory(name: string | null | undefined): boolean {
  return (HEADER_LEADER_CATEGORIES as readonly string[]).includes(String(name || ''));
}

/** @deprecated Use isHeaderLeaderCategory — Lieutenants are not commanders. */
export function isLeaderCategory(name: string | null | undefined): boolean {
  return isHeaderLeaderCategory(name);
}

export function collectCommanders(cards: CardInstance[]): CardInstance[] {
  return (cards || []).filter((c) => isCommanderCategory(c.primaryCategory));
}

function hasKeyword(card: Pick<CardInstance, 'keywords'>, keyword: string): boolean {
  const list = card.keywords || [];
  return list.some((k) => k.toLowerCase() === keyword.toLowerCase());
}

function namesMatch(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Classic Partner (not Partner with). */
function hasClassicPartner(card: Pick<CardInstance, 'keywords'>): boolean {
  return hasKeyword(card, 'Partner') && !hasKeyword(card, 'Partner with');
}

function isBackground(card: Pick<CardInstance, 'typeLine'>): boolean {
  return /\bBackground\b/i.test(card.typeLine || '');
}

function isTimeLordDoctor(card: Pick<CardInstance, 'typeLine'>): boolean {
  return /Time Lord Doctor/i.test(card.typeLine || '');
}

/**
 * Whether two cards form a legal dual-commander pair under partner-family rules.
 */
export function canPartner(
  a: Pick<CardInstance, 'name' | 'keywords' | 'partnerWith' | 'typeLine'>,
  b: Pick<CardInstance, 'name' | 'keywords' | 'partnerWith' | 'typeLine'>,
): boolean {
  if (hasClassicPartner(a) && hasClassicPartner(b)) return true;

  const aWith = a.partnerWith?.trim();
  const bWith = b.partnerWith?.trim();
  if (aWith && namesMatch(aWith, b.name)) return true;
  if (bWith && namesMatch(bWith, a.name)) return true;

  if (hasKeyword(a, 'Friends forever') && hasKeyword(b, 'Friends forever')) return true;

  if (hasKeyword(a, "Doctor's companion") && isTimeLordDoctor(b)) return true;
  if (hasKeyword(b, "Doctor's companion") && isTimeLordDoctor(a)) return true;

  if (hasKeyword(a, 'Choose a Background') && isBackground(b)) return true;
  if (hasKeyword(b, 'Choose a Background') && isBackground(a)) return true;

  return false;
}

/**
 * Partner pairing among Commander-category cards only.
 * Lieutenants are never part of a commander pair.
 */
export function pickCommanderPair(cards: CardInstance[]): CommanderPairResult {
  const commanders = collectCommanders(cards);
  if (commanders.length === 0) return { status: 'none' };
  if (commanders.length === 1) return { status: 'single', a: commanders[0] };
  if (commanders.length > 2) return { status: 'many' };

  const [a, b] = commanders;
  if (a.keywords == null || b.keywords == null) {
    return { status: 'unknown', a, b };
  }
  return {
    status: canPartner(a, b) ? 'legal' : 'illegal',
    a,
    b,
  };
}

/** @deprecated Use pickCommanderPair */
export function pickLeaderPair(cards: CardInstance[]): CommanderPairResult {
  return pickCommanderPair(cards);
}

/** @deprecated Use CommanderPairStatus */
export type LeaderPairStatus = CommanderPairStatus;
/** @deprecated Use CommanderPairResult */
export type LeaderPairResult = CommanderPairResult;
