/** Categories that appear in the deck header (not all are commanders). */
export const HEADER_LEADER_CATEGORIES = ['Commander', 'Lieutenants'] as const;

/** Minimal card shape for partner checks (lean card + oracle fields). */
export type PartnerCard = {
  instanceId?: string;
  name: string;
  primaryCategory?: string;
  keywords?: string[] | null;
  partnerWith?: string | null;
  typeLine?: string | null;
};

export type CommanderPairStatus = 'legal' | 'illegal' | 'unknown' | 'single' | 'none' | 'many';

export type CommanderPairResult =
  | { status: 'none'; a?: undefined; b?: undefined }
  | { status: 'single'; a: PartnerCard; b?: undefined }
  | { status: 'many'; a?: undefined; b?: undefined }
  | { status: 'legal' | 'illegal' | 'unknown'; a: PartnerCard; b: PartnerCard };

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

export function collectCommanders<T extends PartnerCard & { primaryCategory?: string }>(
  cards: T[],
): T[] {
  return (cards || []).filter((c) => isCommanderCategory(c.primaryCategory));
}

/** Normalized key for grouping commander printings by oracle name. */
export function commanderNameKey(name: string | null | undefined): string {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export type CommanderNameGroup<T extends PartnerCard = PartnerCard> = {
  nameKey: string;
  /** Display name from the first instance in deck order. */
  name: string;
  cards: T[];
  primary: T;
};

export type CommanderLeadersResult<T extends PartnerCard = PartnerCard> =
  | {
      kind: 'none';
      primaries: [];
      groups: [];
      partnerStatus?: undefined;
    }
  | {
      kind: 'single';
      primaries: [T];
      groups: [CommanderNameGroup<T>];
      partnerStatus?: undefined;
    }
  | {
      kind: 'gallery';
      primaries: [T];
      groups: [CommanderNameGroup<T>];
      partnerStatus?: undefined;
    }
  | {
      kind: 'partner';
      primaries: [T, T];
      groups: [CommanderNameGroup<T>, CommanderNameGroup<T>];
      partnerStatus: 'legal' | 'illegal' | 'unknown';
    }
  | {
      kind: 'many';
      primaries: T[];
      groups: CommanderNameGroup<T>[];
      partnerStatus?: undefined;
    };

function hasKeyword(card: Pick<PartnerCard, 'keywords'>, keyword: string): boolean {
  const list = card.keywords || [];
  return list.some((k) => k.toLowerCase() === keyword.toLowerCase());
}

function namesMatch(a: string, b: string): boolean {
  return commanderNameKey(a) === commanderNameKey(b);
}

/** Classic Partner (not Partner with). */
function hasClassicPartner(card: Pick<PartnerCard, 'keywords'>): boolean {
  return hasKeyword(card, 'Partner') && !hasKeyword(card, 'Partner with');
}

function isBackground(card: Pick<PartnerCard, 'typeLine'>): boolean {
  return /\bBackground\b/i.test(card.typeLine || '');
}

function isTimeLordDoctor(card: Pick<PartnerCard, 'typeLine'>): boolean {
  return /Time Lord Doctor/i.test(card.typeLine || '');
}

/**
 * Whether two cards form a legal dual-commander pair under partner-family rules.
 */
export function canPartner(
  a: Pick<PartnerCard, 'name' | 'keywords' | 'partnerWith' | 'typeLine'>,
  b: Pick<PartnerCard, 'name' | 'keywords' | 'partnerWith' | 'typeLine'>,
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

function pickGroupPrimary<T extends PartnerCard>(
  cards: T[],
  coverInstanceId?: string | null,
): T {
  if (coverInstanceId) {
    const hit = cards.find((c) => c.instanceId === coverInstanceId);
    if (hit) return hit;
  }
  return cards[0]!;
}

/**
 * Group Commander-category cards by oracle name (deck order preserved).
 * Primary within a group is `coverInstanceId` when it belongs to the group,
 * otherwise the first instance in deck order.
 */
export function groupCommandersByName<T extends PartnerCard & { primaryCategory?: string }>(
  cards: T[],
  coverInstanceId?: string | null,
): CommanderNameGroup<T>[] {
  const commanders = collectCommanders(cards);
  const order: string[] = [];
  const byKey = new Map<string, T[]>();
  for (const card of commanders) {
    const key = commanderNameKey(card.name);
    const list = byKey.get(key);
    if (list) {
      list.push(card);
    } else {
      byKey.set(key, [card]);
      order.push(key);
    }
  }
  return order.map((nameKey) => {
    const groupCards = byKey.get(nameKey)!;
    return {
      nameKey,
      name: groupCards[0]!.name,
      cards: groupCards,
      primary: pickGroupPrimary(groupCards, coverInstanceId),
    };
  });
}

function partnerStatusFor(
  a: PartnerCard,
  b: PartnerCard,
): 'legal' | 'illegal' | 'unknown' {
  if (a.keywords == null || b.keywords == null) return 'unknown';
  return canPartner(a, b) ? 'legal' : 'illegal';
}

/**
 * Resolve commander leaders for covers, glance, and browse UI.
 * Same-name multiples form a gallery (one primary). Two distinct names form a
 * partner pair among each name's primary. Three or more names → many.
 */
export function pickCommanderLeaders<T extends PartnerCard & { primaryCategory?: string }>(
  cards: T[],
  coverInstanceId?: string | null,
): CommanderLeadersResult<T> {
  const groups = groupCommandersByName(cards, coverInstanceId);
  if (groups.length === 0) {
    return { kind: 'none', primaries: [], groups: [] };
  }
  if (groups.length === 1) {
    const group = groups[0]!;
    if (group.cards.length === 1) {
      return { kind: 'single', primaries: [group.primary], groups: [group] };
    }
    return { kind: 'gallery', primaries: [group.primary], groups: [group] };
  }
  if (groups.length === 2) {
    const a = groups[0]!;
    const b = groups[1]!;
    return {
      kind: 'partner',
      primaries: [a.primary, b.primary],
      groups: [a, b],
      partnerStatus: partnerStatusFor(a.primary, b.primary),
    };
  }
  return {
    kind: 'many',
    primaries: groups.map((g) => g.primary),
    groups,
  };
}

/**
 * Instance ids of same-name Commander printings that are not the group's primary.
 * These are display/gallery extras and do not count toward deck size.
 */
export function collectCommanderGalleryExtraIds(
  cards: Array<PartnerCard & { primaryCategory?: string; instanceId?: string }>,
  coverInstanceId?: string | null,
): Set<string> {
  const extras = new Set<string>();
  for (const group of groupCommandersByName(cards, coverInstanceId)) {
    const primaryId = group.primary.instanceId;
    for (const card of group.cards) {
      if (card.instanceId && card.instanceId !== primaryId) extras.add(card.instanceId);
    }
  }
  return extras;
}

/**
 * Partner pairing among Commander-category cards only.
 * Lieutenants are never part of a commander pair.
 * Same-oracle-name multiples count as one name (gallery → single).
 */
export function pickCommanderPair<T extends PartnerCard & { primaryCategory?: string }>(
  cards: T[],
  coverInstanceId?: string | null,
): CommanderPairResult {
  const leaders = pickCommanderLeaders(cards, coverInstanceId);
  if (leaders.kind === 'none') return { status: 'none' };
  if (leaders.kind === 'single' || leaders.kind === 'gallery') {
    return { status: 'single', a: leaders.primaries[0] };
  }
  if (leaders.kind === 'partner') {
    const [a, b] = leaders.primaries;
    return { status: leaders.partnerStatus, a, b };
  }
  return { status: 'many' };
}

/** @deprecated Use pickCommanderPair */
export function pickLeaderPair<T extends PartnerCard & { primaryCategory?: string }>(
  cards: T[],
): CommanderPairResult {
  return pickCommanderPair(cards);
}

/** @deprecated Use CommanderPairStatus */
export type LeaderPairStatus = CommanderPairStatus;
/** @deprecated Use CommanderPairResult */
export type LeaderPairResult = CommanderPairResult;
