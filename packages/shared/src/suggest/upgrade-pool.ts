import { SCRYFALL_SUGGEST_POOL_FILTERS, maybeAttachScryfallTags } from '../scryfall/index.js';
import { withPaperGameQuery } from '../deck-builder/scryfall-api.js';
import type { DeckProfile, DeckRecord, SetPoolCard } from './types';
import { cardMatchesFocus, filterSetPoolCardsByFocus, focusKeySuffix, normalizeFocusTags } from './focus-filter.js';
import {
  UPGRADE_MIN_POOL_TARGET,
  UPGRADE_SEARCH_RAW_CAP,
  buildOtagClause,
  collectProfileSearchTags,
  nonEvergreenKeywordInterests,
  searchTagsKeySuffix,
} from './upgrade-pool-tags.js';

const SCRYFALL_API = 'https://api.scryfall.com';
const USER_AGENT = 'rayenz-hub/1.0';
const REQUEST_DELAY_MS = 100;

export const DEFAULT_UPGRADE_POOL_CAP = 250;

export function readUpgradePoolCap(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.HUB_UPGRADE_POOL_CAP;
  const n = raw != null && raw !== '' ? Number.parseInt(String(raw), 10) : DEFAULT_UPGRADE_POOL_CAP;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_UPGRADE_POOL_CAP;
}

export function computePerCardCap(budgetUsd: number): number {
  const per = budgetUsd / 3;
  return Math.min(Math.max(per, 1), 15);
}

export function computeUpgradePoolKey(
  deckId: string,
  budgetUsd: number,
  focusTags?: string[],
  searchTags?: string[],
): string {
  const bucket = Math.round(budgetUsd);
  const base = `upgrade:${deckId}:${bucket}`;
  return base + focusKeySuffix(focusTags || []) + searchTagsKeySuffix(searchTags || []);
}

function deckColorIdentity(deck: DeckRecord): string[] {
  const letters = new Set<string>();
  ((deck.deck_snapshot && deck.deck_snapshot.cards) || []).forEach((c) => {
    (c.color_identity || []).forEach((ci) => letters.add(String(ci).toUpperCase()));
  });
  return [...letters].sort().join('').split('').filter(Boolean);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  });
  if (res.status === 404) {
    return { data: [], total_cards: 0 };
  }
  if (res.status === 429) {
    const err = new Error('Scryfall rate limit — try again in a moment.');
    (err as { code?: string }).code = 'SCRYFALL_RATE_LIMIT';
    throw err;
  }
  if (!res.ok) {
    const err = new Error(`Scryfall ${res.status}`);
    (err as { code?: string }).code = 'SCRYFALL_UPSTREAM';
    (err as { status?: number }).status = res.status;
    throw err;
  }
  return res.json();
}

function normalizePoolCard(raw: Record<string, unknown>): SetPoolCard {
  const prices = raw.prices as { usd?: string | null } | undefined;
  const usdRaw = prices?.usd;
  const usd = usdRaw != null ? Number.parseFloat(String(usdRaw)) : null;
  return {
    name: String(raw.name || ''),
    set_code: String(raw.set || '').toUpperCase(),
    collector_number: String(raw.collector_number || ''),
    scryfall_id: raw.id != null ? String(raw.id) : null,
    oracle_id: raw.oracle_id != null ? String(raw.oracle_id) : null,
    type_line: String(raw.type_line || ''),
    oracle_text: String(raw.oracle_text || ''),
    keywords: Array.isArray(raw.keywords) ? (raw.keywords as string[]) : [],
    color_identity: Array.isArray(raw.color_identity) ? (raw.color_identity as string[]) : [],
    cmc: Number(raw.cmc || 0),
    oracle_tags: Array.isArray(raw.oracle_tags) ? (raw.oracle_tags as string[]) : [],
    tags: Array.isArray(raw.tags) ? (raw.tags as string[]) : [],
    ...(usd != null && Number.isFinite(usd) ? { usd } : {}),
  } as SetPoolCard & { usd?: number };
}

function matchesProfileIntent(card: SetPoolCard, profile?: DeckProfile | null): boolean {
  const themes = [
    ...(profile?.themes || []),
    ...(profile?.profile_tags || []),
    ...(profile?.tags || []),
  ].map((t) => String(t).toLowerCase());
  const typal = (profile?.typal_types || []).map((t) => String(t).toLowerCase());
  const keywords = nonEvergreenKeywordInterests(profile).map((t) => String(t).toLowerCase());
  const roleTags: string[] = [];
  (profile?.roles || []).forEach((r) => (r.tags || []).forEach((t) => roleTags.push(String(t).toLowerCase())));

  const hasIntent =
    themes.length + typal.length + keywords.length + roleTags.length > 0;
  if (!hasIntent) return true;

  const typeLine = String(card.type_line || '').toLowerCase();
  const oracle = String(card.oracle_text || '').toLowerCase();
  const cardKw = (card.keywords || []).map((k) => String(k).toLowerCase());
  const cardTags = [...(card.oracle_tags || []), ...(card.tags || [])].map((t) =>
    String(t).toLowerCase(),
  );

  if (typal.some((t) => typeLine.includes(t))) return true;
  if (keywords.some((k) => cardKw.includes(k) || oracle.includes(k))) return true;
  if (themes.some((t) => cardTags.includes(t) || oracle.includes(t))) return true;
  if (roleTags.some((t) => cardTags.includes(t) || oracle.includes(t))) return true;
  return false;
}

type SearchOrder = { order?: string; dir?: string };

function buildSearchUrl(query: string, opts?: { page?: number } & SearchOrder): string {
  const q = withPaperGameQuery(`${query} unique:cards ${SCRYFALL_SUGGEST_POOL_FILTERS}`);
  const params = new URLSearchParams();
  params.set('q', q);
  if (opts?.order) params.set('order', opts.order);
  if (opts?.dir) params.set('dir', opts.dir);
  if (opts?.page != null && opts.page > 1) params.set('page', String(opts.page));
  return `${SCRYFALL_API}/cards/search?${params.toString()}`;
}

async function probeSearchTotalCards(query: string, order: SearchOrder): Promise<number> {
  const url = buildSearchUrl(query, { page: 1, ...order });
  const data = (await fetchJson(url)) as { data?: unknown[]; total_cards?: number };
  if (typeof data.total_cards === 'number') return data.total_cards;
  return (data.data || []).length;
}

/** Expand otag OR-clause until Scryfall reports enough cards or tags are exhausted. */
export async function resolveAdaptiveSearchTags(
  profileTags: string[],
  baseQuery: string,
  order: SearchOrder,
  minTarget = UPGRADE_MIN_POOL_TARGET,
): Promise<string[]> {
  if (!profileTags.length) return [];
  let active = [profileTags[0]!];
  let total = await probeSearchTotalCards(`${baseQuery} ${buildOtagClause(active)}`.trim(), order);
  let idx = 1;
  while (total < minTarget && idx < profileTags.length) {
    active = profileTags.slice(0, idx + 1);
    total = await probeSearchTotalCards(`${baseQuery} ${buildOtagClause(active)}`.trim(), order);
    idx += 1;
  }
  return active;
}

export function composeUpgradeSearchQuery(baseClauses: string, searchTags: string[]): string {
  const parts = baseClauses.split(' ').filter(Boolean);
  const otag = buildOtagClause(searchTags);
  if (otag) parts.push(otag);
  return parts.join(' ');
}

async function searchUpgradeCards(
  query: string,
  maxRaw: number,
  order: SearchOrder = { order: 'usd', dir: 'desc' },
): Promise<SetPoolCard[]> {
  let url: string | null = buildSearchUrl(query, { page: 1, ...order });
  const raw: Record<string, unknown>[] = [];
  while (url && raw.length < maxRaw) {
    const data = (await fetchJson(url)) as {
      data?: Record<string, unknown>[];
      next_page?: string;
    };
    const page = data.data || [];
    const remaining = maxRaw - raw.length;
    raw.push(...(remaining < page.length ? page.slice(0, remaining) : page));
    if (raw.length >= maxRaw) break;
    url = data.next_page || null;
    if (url) await sleep(REQUEST_DELAY_MS);
  }
  const normalized = raw.map(normalizePoolCard);
  const tagged = await maybeAttachScryfallTags(normalized);
  return tagged as SetPoolCard[];
}

function sortPoolByPriceDesc(cards: SetPoolCard[]): SetPoolCard[] {
  return cards.slice().sort((a, b) => {
    const au = (a as SetPoolCard & { usd?: number }).usd;
    const bu = (b as SetPoolCard & { usd?: number }).usd;
    const aHas = au != null && Number.isFinite(au);
    const bHas = bu != null && Number.isFinite(bu);
    if (aHas && bHas) return bu! - au!;
    if (aHas) return -1;
    if (bHas) return 1;
    return 0;
  });
}

export type BuildUpgradePoolResult = {
  cards: SetPoolCard[];
  codesKey: string;
  codes: string[];
  primaryCode: string;
  cardCount: number;
};

export async function buildUpgradePool(
  deck: DeckRecord,
  profile: DeckProfile | undefined,
  budgetUsd: number,
  opts?: { focusTags?: string[]; cap?: number },
): Promise<BuildUpgradePoolResult> {
  const cap = opts?.cap ?? readUpgradePoolCap();
  const focusTags = normalizeFocusTags(opts?.focusTags);
  const ci = deckColorIdentity(deck);
  const idClause = ci.length ? `id:${ci.join('')}` : '';
  const perCard = computePerCardCap(budgetUsd);
  const usdClause = `usd<=${perCard.toFixed(2)}`;
  const baseQuery = [idClause, usdClause].filter(Boolean).join(' ');
  const searchOrder = { order: 'usd', dir: 'desc' };

  const profileTags = collectProfileSearchTags(profile);
  const searchTags = profileTags.length
    ? await resolveAdaptiveSearchTags(profileTags, baseQuery, searchOrder)
    : [];
  const query = composeUpgradeSearchQuery(baseQuery, searchTags);
  const codesKey = computeUpgradePoolKey(deck.deck_id, budgetUsd, focusTags, searchTags);

  let cards = await searchUpgradeCards(query, UPGRADE_SEARCH_RAW_CAP, searchOrder);
  cards = cards.filter((c) => matchesProfileIntent(c, profile));
  cards = filterSetPoolCardsByFocus(cards, focusTags);
  cards = sortPoolByPriceDesc(cards);
  if (cards.length > cap) cards = cards.slice(0, cap);

  return {
    cards,
    codesKey,
    codes: [codesKey],
    primaryCode: 'UPGRADE',
    cardCount: cards.length,
  };
}

export function enrichSuggestionPrices(suggestions: import('./types').Suggestion[]): void {
  suggestions.forEach((s) => {
    const card = s.card as SetPoolCard & { usd?: number };
    if (card.usd != null && Number.isFinite(card.usd)) {
      (s as { incomingUsd?: number }).incomingUsd = card.usd;
    }
  });
}

export function ownedNamesFromDeck(deck: DeckRecord): Set<string> {
  const names = new Set<string>();
  ((deck.deck_snapshot && deck.deck_snapshot.cards) || []).forEach((c) => {
    if (c.name) names.add(String(c.name).toLowerCase());
  });
  return names;
}
