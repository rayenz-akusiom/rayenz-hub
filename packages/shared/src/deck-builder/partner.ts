/** Categories that appear in the deck header (not all are commanders). */
export const HEADER_LEADER_CATEGORIES = ['Commander', 'Lieutenants'] as const;

export const PENDRAGON_ARTHUR = 'Arthur';
export const PENDRAGON_EXCALIBUR = 'Excalibur';
export const PENDRAGON_HEADER_CATEGORIES = [PENDRAGON_ARTHUR, PENDRAGON_EXCALIBUR] as const;

/** Minimal card shape for partner checks (lean card + oracle fields). */
export type PartnerCard = {
  instanceId?: string;
  name: string;
  primaryCategory?: string;
  keywords?: string[] | null;
  partnerWith?: string | null;
  typeLine?: string | null;
  oracleText?: string | null;
};

export type CommanderPairStatus = 'legal' | 'illegal' | 'unknown' | 'single' | 'none' | 'many';

export type CommanderPairResult =
  | { status: 'none'; a?: undefined; b?: undefined }
  | { status: 'single'; a: PartnerCard; b?: undefined }
  | { status: 'many'; a?: undefined; b?: undefined }
  | { status: 'legal' | 'illegal' | 'unknown'; a: PartnerCard; b: PartnerCard };

/** CR 702.124 partner-family ability on a single card (a card may have several). */
export type PartnerAbility =
  | { kind: 'partner' }
  | { kind: 'partner_with'; name: string }
  | { kind: 'partner_designator'; designator: string }
  | { kind: 'choose_a_background' }
  | { kind: 'doctors_companion' }
  | { kind: 'background' }
  | { kind: 'time_lord_doctor' };

/** Known Partner— designators (CR 702.124i); others still parse dynamically. */
export const KNOWN_PARTNER_DESIGNATORS = [
  'Character select',
  'Father & son',
  'Friends forever',
  'Survivors',
] as const;

export const PARTNER_PAIRING_OTHER_LANE = 'Other';

/** Fixed browse order for known lanes; Other is always last. */
export const PARTNER_PAIRING_KNOWN_LANES = [
  'Partner with',
  ...KNOWN_PARTNER_DESIGNATORS.map((d) => `Partner—${d}`),
  'Partner',
  "Doctor's companion",
  'Choose a Background',
] as const;

/** Parse "Partner with Name" from oracle text. */
export function parsePartnerWithName(oracleText: string | null | undefined): string | null {
  if (!oracleText) return null;
  const m = oracleText.match(/Partner with ([^\n(]+)/i);
  if (!m) return null;
  return m[1].trim().replace(/\s+/g, ' ') || null;
}

/** Normalize a Partner— designator for comparison (case/spacing). */
export function normalizePartnerDesignator(raw: string): string {
  return String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/** Display label for a designator swimlane / ability. */
export function partnerDesignatorLaneLabel(designator: string): string {
  const key = normalizePartnerDesignator(designator);
  const known = KNOWN_PARTNER_DESIGNATORS.find((d) => normalizePartnerDesignator(d) === key);
  return `Partner—${known ?? String(designator).trim().replace(/\s+/g, ' ')}`;
}

export function isCommanderCategory(name: string | null | undefined): boolean {
  return String(name || '') === 'Commander';
}

export function isArthurCategory(name: string | null | undefined): boolean {
  return String(name || '') === PENDRAGON_ARTHUR;
}

export function isExcaliburCategory(name: string | null | undefined): boolean {
  return String(name || '') === PENDRAGON_EXCALIBUR;
}

export function isPendragonLeaderCategory(name: string | null | undefined): boolean {
  return isArthurCategory(name) || isExcaliburCategory(name);
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

/** Command-zone cards for colour identity: Commander, or Arthur + Excalibur. */
export function collectCommandZoneCards<T extends PartnerCard & { primaryCategory?: string }>(
  cards: T[],
  format?: string | null,
): T[] {
  if (format === 'pendragon') {
    return (cards || []).filter((c) => isPendragonLeaderCategory(c.primaryCategory));
  }
  return collectCommanders(cards);
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

const PARTNER_DESIGNATOR_RE = /^Partner\s*[—–-]\s*(.+)$/i;
const ORACLE_PARTNER_DESIGNATOR_RE = /Partner\s*[—–-]\s*([^\n(]+)/gi;

function parseDesignatorFromToken(token: string): string | null {
  const m = String(token || '').trim().match(PARTNER_DESIGNATOR_RE);
  const raw = m?.[1]?.trim().replace(/\s+/g, ' ');
  return raw || null;
}

function collectDesignators(
  card: Pick<PartnerCard, 'keywords' | 'oracleText'>,
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (raw: string | null | undefined) => {
    const trimmed = String(raw || '').trim().replace(/\s+/g, ' ');
    if (!trimmed) return;
    const key = normalizePartnerDesignator(trimmed);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(trimmed);
  };

  for (const kw of card.keywords || []) {
    if (/^friends forever$/i.test(kw.trim())) {
      add('Friends forever');
      continue;
    }
    add(parseDesignatorFromToken(kw));
  }

  const oracle = card.oracleText || '';
  if (oracle) {
    for (const m of oracle.matchAll(ORACLE_PARTNER_DESIGNATOR_RE)) {
      add(m[1]?.trim().replace(/\s+/g, ' '));
    }
  }

  return out;
}

function isBackground(card: Pick<PartnerCard, 'typeLine'>): boolean {
  return /\bBackground\b/i.test(card.typeLine || '');
}

/**
 * Legendary Time Lord Doctor with no other creature types (CR 702.124m).
 * Faces are checked independently; any qualifying face counts.
 */
export function isTimeLordDoctor(card: Pick<PartnerCard, 'typeLine'>): boolean {
  const raw = String(card.typeLine || '').trim();
  if (!raw) return false;
  for (const face of raw.split(/\s+\/\/\s+/)) {
    if (!/\bLegendary\b/i.test(face) || !/\bCreature\b/i.test(face)) continue;
    const dash = face.match(/[—–-]\s*(.+)$/);
    if (!dash?.[1]) continue;
    const subtypes = dash[1]
      .split(/\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    // "Time Lord Doctor" → Time, Lord, Doctor — no other creature types.
    if (
      subtypes.length === 3 &&
      /^time$/i.test(subtypes[0]!) &&
      /^lord$/i.test(subtypes[1]!) &&
      /^doctor$/i.test(subtypes[2]!)
    ) {
      return true;
    }
  }
  return false;
}

type AbilityCard = Pick<PartnerCard, 'name' | 'keywords' | 'partnerWith' | 'typeLine' | 'oracleText'>;

/**
 * All partner-family abilities / roles on a card (CR 702.124g — pick one when building).
 */
export function detectPartnerAbilities(card: AbilityCard): PartnerAbility[] {
  const abilities: PartnerAbility[] = [];
  const keywords = card.keywords || [];
  const hasPartnerWithKw = hasKeyword(card, 'Partner with');
  const designators = collectDesignators(card);
  const hasDesignatorKw = designators.length > 0 || keywords.some((k) => PARTNER_DESIGNATOR_RE.test(k.trim()));

  const partnerWithName =
    card.partnerWith?.trim() ||
    parsePartnerWithName(card.oracleText) ||
    null;
  if (partnerWithName || hasPartnerWithKw) {
    abilities.push({
      kind: 'partner_with',
      name: partnerWithName || '',
    });
  }

  for (const designator of designators) {
    abilities.push({ kind: 'partner_designator', designator });
  }

  // Classic Partner: keyword Partner, but not Partner with / Partner—…
  if (
    hasKeyword(card, 'Partner') &&
    !hasPartnerWithKw &&
    !hasDesignatorKw &&
    designators.length === 0
  ) {
    abilities.push({ kind: 'partner' });
  }

  if (hasKeyword(card, 'Choose a Background')) {
    abilities.push({ kind: 'choose_a_background' });
  }
  if (hasKeyword(card, "Doctor's companion")) {
    abilities.push({ kind: 'doctors_companion' });
  }
  if (isBackground(card)) {
    abilities.push({ kind: 'background' });
  }
  if (isTimeLordDoctor(card)) {
    abilities.push({ kind: 'time_lord_doctor' });
  }

  return abilities;
}

function abilitiesCompatible(
  a: PartnerAbility,
  b: PartnerAbility,
  aName: string,
  bName: string,
): boolean {
  if (a.kind === 'partner' && b.kind === 'partner') return true;
  if (a.kind === 'partner_designator' && b.kind === 'partner_designator') {
    return normalizePartnerDesignator(a.designator) === normalizePartnerDesignator(b.designator);
  }
  if (a.kind === 'partner_with' && a.name && namesMatch(a.name, bName)) return true;
  if (b.kind === 'partner_with' && b.name && namesMatch(b.name, aName)) return true;
  if (a.kind === 'choose_a_background' && b.kind === 'background') return true;
  if (b.kind === 'choose_a_background' && a.kind === 'background') return true;
  if (a.kind === 'doctors_companion' && b.kind === 'time_lord_doctor') return true;
  if (b.kind === 'doctors_companion' && a.kind === 'time_lord_doctor') return true;
  return false;
}

/**
 * Whether two cards form a legal dual-commander pair under partner-family rules.
 * True if any ability on A is compatible with any ability on B (702.124g).
 */
export function canPartner(a: AbilityCard, b: AbilityCard): boolean {
  const aAbs = detectPartnerAbilities(a);
  const bAbs = detectPartnerAbilities(b);
  for (const aa of aAbs) {
    for (const bb of bAbs) {
      if (abilitiesCompatible(aa, bb, a.name, b.name)) return true;
    }
  }
  return false;
}

/**
 * Collection / browse swimlane for a pairing card.
 * Multi-ability cards use priority: Partner with → designator → Partner → Doctor → Background → Other.
 */
export function partnerPairingLane(card: AbilityCard): string {
  const abilities = detectPartnerAbilities(card);
  const partnerWith = abilities.find((a) => a.kind === 'partner_with');
  if (partnerWith) return 'Partner with';

  const designator = abilities.find((a) => a.kind === 'partner_designator');
  if (designator && designator.kind === 'partner_designator') {
    return partnerDesignatorLaneLabel(designator.designator);
  }

  if (abilities.some((a) => a.kind === 'partner')) return 'Partner';
  if (
    abilities.some((a) => a.kind === 'doctors_companion' || a.kind === 'time_lord_doctor')
  ) {
    return "Doctor's companion";
  }
  if (
    abilities.some((a) => a.kind === 'choose_a_background' || a.kind === 'background')
  ) {
    return 'Choose a Background';
  }
  return PARTNER_PAIRING_OTHER_LANE;
}

/** Sort swimlane keys: known order, then unknown designators alpha, Other last. */
export function sortPartnerPairingLaneKeys(keys: string[]): string[] {
  const knownIndex = new Map<string, number>(
    PARTNER_PAIRING_KNOWN_LANES.map((label, i) => [label, i]),
  );
  return [...keys].sort((a, b) => {
    if (a === PARTNER_PAIRING_OTHER_LANE && b !== PARTNER_PAIRING_OTHER_LANE) return 1;
    if (b === PARTNER_PAIRING_OTHER_LANE && a !== PARTNER_PAIRING_OTHER_LANE) return -1;
    if (a === PARTNER_PAIRING_OTHER_LANE && b === PARTNER_PAIRING_OTHER_LANE) return 0;
    const ai = knownIndex.get(a);
    const bi = knownIndex.get(b);
    if (ai != null && bi != null) return ai - bi;
    if (ai != null) return -1;
    if (bi != null) return 1;
    return a.localeCompare(b);
  });
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
