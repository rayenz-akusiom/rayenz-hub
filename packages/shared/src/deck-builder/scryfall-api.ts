import type { CardInstance } from '../schemas/deck-builder.js';
import { normalizeColourIdentity, type ColourLetter } from './color-identity-map.js';
import { isBasicLand } from './quantities.js';
import { scryfallImageFromId } from './scryfall-images.js';

const SCYFALL_API = 'https://api.scryfall.com';
const PAGE_DELAY_MS = 90;

/** Scryfall `/cards/search` `q` max length (Unicode characters). */
export const SCRYFALL_Q_MAX = 1000;

/** Minimal Scryfall card fields we use for search / printings. */
export type ScryfallCard = {
  id: string;
  name: string;
  set: string;
  collector_number: string;
  oracle_id?: string;
  type_line?: string;
  color_identity?: string[];
  finishes?: string[];
  layout?: string;
  keywords?: string[];
  oracle_text?: string;
  printed_name?: string;
  flavor_name?: string;
  cmc?: number;
};

/** Local card identity for collection-scoped syntax search. */
export type SyntaxMembershipCard = {
  name: string;
  scryfallId?: string | null;
};

/** Identifier shapes accepted by POST /cards/collection (max 75 per request). */
export type ScryfallCollectionIdentifier =
  | { id: string }
  | { name: string }
  | { set: string; collector_number: string };

export type ScryfallCollectionResult = {
  data: ScryfallCard[];
  not_found: ScryfallCollectionIdentifier[];
  rateLimited?: boolean;
};

const COLLECTION_CHUNK_SIZE = 75;
/** Collection endpoint hard limit is 2/sec. */
const COLLECTION_DELAY_MS = 500;
const COLLECTION_429_BACKOFF_MS = 2000;

export type ScryfallSearchPage = {
  data: ScryfallCard[];
  has_more: boolean;
  next_page: string | null;
  total_cards?: number;
};

export type PrintingFields = {
  name: string;
  scryfallId: string;
  setCode: string;
  collectorNumber: string;
  typeLine: string | null;
  colourIdentity: ColourLetter[];
  layout: string | null;
  foil: boolean;
  printedName: string | null;
  flavorName: string | null;
  manaValue: number | null;
  /** Scryfall finishes for this printing when known. */
  finishes?: string[] | null;
};

const printCache: Record<string, ScryfallCard[]> = {};
const inSetMembershipCache = new Map<string, ReadonlySet<string>>();
/** Printing Scryfall id → oracle_id (session). */
const oracleIdByPrintingId = new Map<string, string>();

export function clearScryfallPrintCache(): void {
  for (const key of Object.keys(printCache)) {
    delete printCache[key];
  }
}

export function clearInSetMembershipCache(): void {
  inSetMembershipCache.clear();
}

export function clearOracleIdCache(): void {
  oracleIdByPrintingId.clear();
}

/** Parse comma/whitespace set codes → uppercase unique list. */
export function normalizeSetCodes(input: string | string[] | null | undefined): string[] {
  const raw = Array.isArray(input)
    ? input.join(' ')
    : String(input || '');
  const seen = new Set<string>();
  const codes: string[] = [];
  for (const part of raw.split(/[,\s]+/)) {
    const code = part.trim().toUpperCase();
    if (!code || seen.has(code)) continue;
    seen.add(code);
    codes.push(code);
  }
  return codes;
}

export function normalizeSetCodesKey(codes: string[]): string {
  return [...normalizeSetCodes(codes)].sort().join(',');
}

/**
 * Scryfall membership query for one or more set codes.
 * Uses `(in:code OR set:code)` per code so spoiler-season gaps in the `in:`
 * index still match via `set:` printings.
 */
export function buildInSetQuery(codes: string[]): string {
  const normalized = normalizeSetCodes(codes);
  if (!normalized.length) return '';
  const parts = normalized.flatMap((c) => {
    const code = c.toLowerCase();
    return [`in:${code}`, `set:${code}`];
  });
  return `(${parts.join(' OR ')})`;
}

export function normalizeCardNameForSetMatch(name: string): string {
  return String(name || '')
    .trim()
    .toLowerCase();
}

/**
 * True when the card's English name (or DFC front face) is in the name set.
 * Empty set matches nothing.
 */
export function cardMatchesNameMembership(
  cardName: string,
  membership: ReadonlySet<string>,
): boolean {
  const full = normalizeCardNameForSetMatch(cardName);
  if (!full) return false;
  if (membership.has(full)) return true;
  const front = full.split(' // ')[0]?.trim() || '';
  return Boolean(front && membership.has(front));
}

/**
 * True when filter is off, or when the card's English name (or DFC front face)
 * appears in the Scryfall set-membership name set (`in:` ∪ `set:`).
 * Basic lands never match — they appear in nearly every set, so they are not useful.
 */
export function cardMatchesSetMembership(
  cardName: string,
  membership: ReadonlySet<string> | null | undefined,
): boolean {
  if (membership == null || membership.size === 0) return true;
  if (isBasicLand({ name: cardName })) return false;
  return cardMatchesNameMembership(cardName, membership);
}

/**
 * Syntax filter: null = off; empty set = no Scryfall hits (hide all).
 * Basics are not special-cased — `t:land` should keep Forests.
 */
export function cardMatchesSyntaxMembership(
  cardName: string,
  membership: ReadonlySet<string> | null | undefined,
): boolean {
  if (membership == null) return true;
  return cardMatchesNameMembership(cardName, membership);
}

export function buildSearchUrl(
  query: string,
  page = 1,
  opts?: { unique?: 'cards' | 'prints' | 'art' },
): string {
  const q = String(query || '').trim();
  const url = new URL(`${SCYFALL_API}/cards/search`);
  url.searchParams.set('q', q);
  if (opts?.unique) url.searchParams.set('unique', opts.unique);
  if (page > 1) url.searchParams.set('page', String(page));
  return url.toString();
}

export function buildPrintingsSearchUrl(cardName: string, page = 1): string {
  const name = String(cardName || '').trim();
  const url = new URL(`${SCYFALL_API}/cards/search`);
  url.searchParams.set('q', `!"${name}"`);
  url.searchParams.set('unique', 'prints');
  url.searchParams.set('order', 'released');
  if (page > 1) url.searchParams.set('page', String(page));
  return url.toString();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function parseError(res: Response, fallback: string): Promise<Error> {
  if (res.status === 429) {
    return new Error('Scryfall rate limit — try again in a moment.');
  }
  if (res.status === 404) {
    return new Error(fallback);
  }
  try {
    const body = (await res.json()) as { details?: string };
    if (body?.details) return new Error(body.details);
  } catch {
    /* ignore */
  }
  return new Error(fallback);
}

function asScryfallCard(raw: unknown): ScryfallCard | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Record<string, unknown>;
  if (typeof c.id !== 'string' || typeof c.name !== 'string') return null;
  return {
    id: c.id,
    name: c.name,
    set: typeof c.set === 'string' ? c.set : '',
    collector_number: c.collector_number != null ? String(c.collector_number) : '',
    oracle_id: typeof c.oracle_id === 'string' && c.oracle_id.trim() ? c.oracle_id : undefined,
    type_line: typeof c.type_line === 'string' ? c.type_line : undefined,
    color_identity: Array.isArray(c.color_identity)
      ? (c.color_identity as string[])
      : undefined,
    finishes: Array.isArray(c.finishes) ? (c.finishes as string[]) : undefined,
    layout: typeof c.layout === 'string' ? c.layout : undefined,
    keywords: Array.isArray(c.keywords) ? (c.keywords as string[]) : undefined,
    oracle_text: typeof c.oracle_text === 'string' ? c.oracle_text : undefined,
    printed_name: typeof c.printed_name === 'string' ? c.printed_name : undefined,
    flavor_name: typeof c.flavor_name === 'string' ? c.flavor_name : undefined,
    cmc: typeof c.cmc === 'number' && Number.isFinite(c.cmc) ? c.cmc : undefined,
  };
}

export function scryfallCardImageUrl(card: Pick<ScryfallCard, 'id'>): string {
  return scryfallImageFromId(card.id) || '';
}

export function mapScryfallCardToPrinting(
  card: ScryfallCard,
  opts?: { foil?: boolean },
): PrintingFields {
  const finishes = card.finishes || [];
  const wantFoil = Boolean(opts?.foil);
  const foil = wantFoil && finishes.includes('foil');
  return {
    name: card.name,
    scryfallId: card.id,
    setCode: card.set || '',
    collectorNumber: card.collector_number || '',
    typeLine: card.type_line || null,
    colourIdentity: normalizeColourIdentity(card.color_identity || []),
    layout: card.layout || null,
    foil,
    printedName: card.printed_name?.trim() || null,
    flavorName: card.flavor_name?.trim() || null,
    manaValue: typeof card.cmc === 'number' && Number.isFinite(card.cmc) ? card.cmc : null,
    finishes: finishes.length ? finishes : null,
  };
}

export function printingSupportsFoil(card: ScryfallCard): boolean {
  return (card.finishes || []).includes('foil');
}

/** Build a collection identifier preferring id, then set+cn, then name. */
export function collectionIdentifierForCard(card: {
  scryfallId?: string | null;
  setCode?: string | null;
  collectorNumber?: string | null;
  name: string;
}): ScryfallCollectionIdentifier | null {
  if (card.scryfallId) return { id: String(card.scryfallId) };
  if (card.setCode && card.collectorNumber != null && card.collectorNumber !== '') {
    return {
      set: String(card.setCode).toLowerCase(),
      collector_number: String(card.collectorNumber),
    };
  }
  const name = String(card.name || '').trim();
  if (!name) return null;
  return { name };
}

/**
 * POST /cards/collection in chunks of ≤75. Waits between chunks; on 429 backs off and stops.
 */
export async function fetchCardsCollection(
  identifiers: ScryfallCollectionIdentifier[],
  opts?: {
    fetchImpl?: typeof fetch;
    delayMs?: number;
    backoffMs?: number;
    chunkSize?: number;
    signal?: AbortSignal;
  },
): Promise<ScryfallCollectionResult> {
  const fetchImpl = opts?.fetchImpl || fetch;
  const delayMs = opts?.delayMs ?? COLLECTION_DELAY_MS;
  const backoffMs = opts?.backoffMs ?? COLLECTION_429_BACKOFF_MS;
  const chunkSize = opts?.chunkSize ?? COLLECTION_CHUNK_SIZE;
  const data: ScryfallCard[] = [];
  const not_found: ScryfallCollectionIdentifier[] = [];

  for (let i = 0; i < identifiers.length; i += chunkSize) {
    if (opts?.signal?.aborted) break;
    if (i > 0) await sleep(delayMs);

    const chunk = identifiers.slice(i, i + chunkSize);
    const res = await fetchImpl(`${SCYFALL_API}/cards/collection`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ identifiers: chunk }),
      signal: opts?.signal,
    });

    if (res.status === 429) {
      await sleep(backoffMs);
      return { data, not_found, rateLimited: true };
    }
    if (!res.ok) {
      throw await parseError(res, 'Scryfall collection lookup failed.');
    }

    const json = (await res.json()) as {
      data?: unknown[];
      not_found?: ScryfallCollectionIdentifier[];
    };
    for (const raw of json.data || []) {
      const card = asScryfallCard(raw);
      if (card) data.push(card);
    }
    if (Array.isArray(json.not_found)) {
      not_found.push(...json.not_found);
    }
  }

  return { data, not_found };
}

export async function searchCards(
  query: string,
  page = 1,
  opts?: {
    fetchImpl?: typeof fetch;
    delayMs?: number;
    unique?: 'cards' | 'prints' | 'art';
    signal?: AbortSignal;
    /** When true, HTTP 404 is an empty page instead of an error. */
    emptyOnNotFound?: boolean;
  },
): Promise<ScryfallSearchPage> {
  const q = String(query || '').trim();
  if (!q) {
    throw new Error('Enter a Scryfall search query.');
  }
  const fetchImpl = opts?.fetchImpl || fetch;
  if (page > 1) {
    await sleep(opts?.delayMs ?? PAGE_DELAY_MS);
  }
  const res = await fetchImpl(buildSearchUrl(q, page, { unique: opts?.unique }), {
    headers: { Accept: 'application/json' },
    signal: opts?.signal,
  });
  if (!res.ok) {
    if (opts?.emptyOnNotFound && res.status === 404) {
      return { data: [], has_more: false, next_page: null, total_cards: 0 };
    }
    throw await parseError(res, 'No cards matched that search.');
  }
  const json = (await res.json()) as {
    data?: unknown[];
    has_more?: boolean;
    next_page?: string | null;
    total_cards?: number;
  };
  const data = (json.data || [])
    .map(asScryfallCard)
    .filter((c): c is ScryfallCard => Boolean(c));
  return {
    data,
    has_more: Boolean(json.has_more),
    next_page: json.next_page || null,
    total_cards: json.total_cards,
  };
}

function addNameToMembership(names: Set<string>, rawName: string): void {
  const full = normalizeCardNameForSetMatch(rawName);
  if (!full) return;
  names.add(full);
  const front = full.split(' // ')[0]?.trim() || '';
  if (front) names.add(front);
}

/**
 * Fetch oracle card names for the given sets via Scryfall `(in:|set:)` per code.
 * Results are cached by normalized codes key for the session.
 */
export async function fetchInSetMembership(
  codes: string | string[],
  opts?: {
    fetchImpl?: typeof fetch;
    delayMs?: number;
    forceRefresh?: boolean;
    signal?: AbortSignal;
  },
): Promise<ReadonlySet<string>> {
  const normalized = normalizeSetCodes(codes);
  if (!normalized.length) return new Set();
  const key = normalizeSetCodesKey(normalized);
  if (!opts?.forceRefresh) {
    const cached = inSetMembershipCache.get(key);
    if (cached) return cached;
  }

  const query = buildInSetQuery(normalized);
  const names = new Set<string>();
  const searchOpts = {
    fetchImpl: opts?.fetchImpl,
    delayMs: opts?.delayMs,
    unique: 'cards' as const,
  };

  let page = await searchCards(query, 1, searchOpts);
  for (const card of page.data) addNameToMembership(names, card.name);

  while (page.has_more && page.next_page) {
    if (opts?.signal?.aborted) {
      throw new Error('Set membership fetch aborted.');
    }
    page = await searchCardsNextPage(page.next_page, {
      fetchImpl: opts?.fetchImpl,
      delayMs: opts?.delayMs,
    });
    for (const card of page.data) addNameToMembership(names, card.name);
  }

  inSetMembershipCache.set(key, names);
  return names;
}

/** Exact-name Scryfall clause (`!"Sol Ring"`). Strips embedded quotes. */
export function exactNameClause(name: string): string {
  const cleaned = String(name || '')
    .trim()
    .replace(/"/g, '');
  if (!cleaned) return '';
  return `!"${cleaned}"`;
}

/** Undocumented Scryfall operator used by printings search URIs. */
export function oracleIdClause(oracleId: string): string {
  const id = String(oracleId || '').trim();
  return id ? `oracleid:${id}` : '';
}

/**
 * Stable key for the in-scope card list so syntax membership can refetch
 * when printings/names change without re-running on unrelated deck edits.
 */
export function syntaxScopeKey(cards: SyntaxMembershipCard[]): string {
  const ids: string[] = [];
  const names: string[] = [];
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();
  for (const card of cards || []) {
    const id = String(card.scryfallId || '').trim();
    if (id) {
      if (!seenIds.has(id)) {
        seenIds.add(id);
        ids.push(id);
      }
      continue;
    }
    const name = normalizeCardNameForSetMatch(card.name);
    if (name && !seenNames.has(name)) {
      seenNames.add(name);
      names.push(name);
    }
  }
  ids.sort();
  names.sort();
  return `${ids.join(',')}|${names.join('\n')}`;
}

/**
 * Batch `(userQuery) (clause or clause …)` queries under Scryfall's `q` length cap.
 */
export function buildScopedSearchQueries(
  userQuery: string,
  clauses: string[],
  maxQ = SCRYFALL_Q_MAX,
): string[] {
  const q = String(userQuery || '').trim();
  const usable = (clauses || []).map((c) => String(c || '').trim()).filter(Boolean);
  if (!q || !usable.length) return [];
  const prefix = `(${q}) (`;
  const suffix = ')';
  const overhead = prefix.length + suffix.length;
  const queries: string[] = [];
  let batch: string[] = [];
  let batchLen = overhead;

  for (const clause of usable) {
    const extra = batch.length === 0 ? clause.length : 4 + clause.length;
    if (batch.length && batchLen + extra > maxQ) {
      queries.push(`${prefix}${batch.join(' or ')}${suffix}`);
      batch = [clause];
      batchLen = overhead + clause.length;
    } else {
      batch.push(clause);
      batchLen += extra;
    }
  }
  if (batch.length) {
    queries.push(`${prefix}${batch.join(' or ')}${suffix}`);
  }
  return queries;
}

function collectSyntaxClauses(
  cards: SyntaxMembershipCard[],
): { ids: string[]; nameById: Map<string, string>; namesWithoutId: string[] } {
  const ids: string[] = [];
  const seenIds = new Set<string>();
  const nameById = new Map<string, string>();
  const namesWithoutId: string[] = [];
  const seenNames = new Set<string>();

  for (const card of cards || []) {
    const name = String(card.name || '').trim();
    const id = String(card.scryfallId || '').trim();
    if (id) {
      if (!seenIds.has(id)) {
        seenIds.add(id);
        ids.push(id);
        if (name) nameById.set(id, name);
      }
      continue;
    }
    if (!name) continue;
    const key = name.toLowerCase();
    if (seenNames.has(key)) continue;
    seenNames.add(key);
    namesWithoutId.push(name);
  }

  return { ids, nameById, namesWithoutId };
}

function clausesForResolvedCards(
  ids: string[],
  nameById: Map<string, string>,
  namesWithoutId: string[],
): string[] {
  const clauses: string[] = [];
  const seen = new Set<string>();
  function add(clause: string) {
    if (!clause || seen.has(clause)) return;
    seen.add(clause);
    clauses.push(clause);
  }
  for (const id of ids) {
    const oracle = oracleIdByPrintingId.get(id);
    if (oracle) add(oracleIdClause(oracle));
    else {
      const name = nameById.get(id);
      if (name) add(exactNameClause(name));
    }
  }
  for (const name of namesWithoutId) add(exactNameClause(name));
  return clauses;
}

/**
 * Collection-scoped Scryfall syntax search: resolve printing ids to `oracleid:`,
 * fall back to `!"name"`, then AND the user query in batches under the `q` cap.
 * HTTP 404 (no matches) yields an empty membership set.
 */
export async function fetchSyntaxMembership(
  userQuery: string,
  cards: SyntaxMembershipCard[],
  opts?: {
    fetchImpl?: typeof fetch;
    delayMs?: number;
    signal?: AbortSignal;
  },
): Promise<ReadonlySet<string>> {
  const q = String(userQuery || '').trim();
  if (!q) return new Set();

  const { ids, nameById, namesWithoutId } = collectSyntaxClauses(cards);
  const unresolved = ids.filter((id) => !oracleIdByPrintingId.has(id));
  if (unresolved.length) {
    const result = await fetchCardsCollection(
      unresolved.map((id) => ({ id })),
      {
        fetchImpl: opts?.fetchImpl,
        delayMs: opts?.delayMs,
        signal: opts?.signal,
      },
    );
    if (opts?.signal?.aborted) {
      throw new Error('Syntax membership fetch aborted.');
    }
    for (const card of result.data) {
      if (card.oracle_id) oracleIdByPrintingId.set(card.id, card.oracle_id);
    }
  }

  const clauses = clausesForResolvedCards(ids, nameById, namesWithoutId);
  if (!clauses.length) return new Set();

  const queries = buildScopedSearchQueries(q, clauses);
  const names = new Set<string>();
  const searchOpts = {
    fetchImpl: opts?.fetchImpl,
    delayMs: opts?.delayMs,
    unique: 'cards' as const,
    signal: opts?.signal,
    emptyOnNotFound: true,
  };

  for (let i = 0; i < queries.length; i++) {
    if (opts?.signal?.aborted) {
      throw new Error('Syntax membership fetch aborted.');
    }
    if (i > 0) await sleep(opts?.delayMs ?? PAGE_DELAY_MS);
    let page = await searchCards(queries[i]!, 1, searchOpts);
    for (const card of page.data) addNameToMembership(names, card.name);
    while (page.has_more && page.next_page) {
      if (opts?.signal?.aborted) {
        throw new Error('Syntax membership fetch aborted.');
      }
      page = await searchCardsNextPage(page.next_page, {
        fetchImpl: opts?.fetchImpl,
        delayMs: opts?.delayMs,
        signal: opts?.signal,
      });
      for (const card of page.data) addNameToMembership(names, card.name);
    }
  }

  return names;
}

export async function searchCardsNextPage(
  nextPageUrl: string,
  opts?: { fetchImpl?: typeof fetch; delayMs?: number; signal?: AbortSignal },
): Promise<ScryfallSearchPage> {
  const fetchImpl = opts?.fetchImpl || fetch;
  await sleep(opts?.delayMs ?? PAGE_DELAY_MS);
  const res = await fetchImpl(nextPageUrl, {
    headers: { Accept: 'application/json' },
    signal: opts?.signal,
  });
  if (!res.ok) {
    throw await parseError(res, 'Failed to load more results.');
  }
  const json = (await res.json()) as {
    data?: unknown[];
    has_more?: boolean;
    next_page?: string | null;
    total_cards?: number;
  };
  const data = (json.data || [])
    .map(asScryfallCard)
    .filter((c): c is ScryfallCard => Boolean(c));
  return {
    data,
    has_more: Boolean(json.has_more),
    next_page: json.next_page || null,
    total_cards: json.total_cards,
  };
}

/** Fetch a single Scryfall card by id, or null when missing. */
export async function fetchCardById(
  scryfallId: string,
  opts?: { fetchImpl?: typeof fetch },
): Promise<ScryfallCard | null> {
  const id = String(scryfallId || '').trim();
  if (!id) return null;
  const fetchImpl = opts?.fetchImpl || fetch;
  const res = await fetchImpl(`${SCYFALL_API}/cards/${encodeURIComponent(id)}`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) return null;
  return asScryfallCard(await res.json());
}

/**
 * One page of printings for a card name (`unique=prints`, `order=released`).
 * Does not follow `has_more` — callers paginate via `searchCardsNextPage`.
 */
export async function fetchPrintingsPage(
  cardName: string,
  page = 1,
  opts?: {
    fetchImpl?: typeof fetch;
    delayMs?: number;
    defaultScryfallId?: string | null;
  },
): Promise<ScryfallSearchPage> {
  const name = String(cardName || '').trim();
  if (!name) {
    throw new Error('Card name is required for printings search.');
  }
  const fetchImpl = opts?.fetchImpl || fetch;
  const pageNum = Math.max(1, Math.floor(Number(page) || 1));
  if (pageNum > 1) {
    await sleep(opts?.delayMs ?? PAGE_DELAY_MS);
  }
  const res = await fetchImpl(buildPrintingsSearchUrl(name, pageNum), {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    if (pageNum === 1 && opts?.defaultScryfallId) {
      const one = await fetchCardById(opts.defaultScryfallId, { fetchImpl });
      if (one) {
        return { data: [one], has_more: false, next_page: null };
      }
    }
    throw await parseError(res, `Scryfall lookup failed for ${name}`);
  }
  const json = (await res.json()) as {
    data?: unknown[];
    has_more?: boolean;
    next_page?: string | null;
    total_cards?: number;
  };
  const data = (json.data || [])
    .map(asScryfallCard)
    .filter((c): c is ScryfallCard => Boolean(c));
  return {
    data,
    has_more: Boolean(json.has_more),
    next_page: json.next_page || null,
    total_cards: json.total_cards,
  };
}

/**
 * First page of printings only (cached by name). For Review/Reconcile dropdowns.
 * Prefer `fetchPrintingsPage` + `searchCardsNextPage` for lazy UI grids.
 */
export async function fetchPrintings(
  cardName: string,
  options?: {
    defaultScryfallId?: string | null;
    fetchImpl?: typeof fetch;
  },
): Promise<ScryfallCard[]> {
  const name = String(cardName || '').trim();
  const cacheKey = name.toLowerCase();
  if (printCache[cacheKey]) {
    return printCache[cacheKey];
  }
  const page = await fetchPrintingsPage(name, 1, {
    fetchImpl: options?.fetchImpl,
    defaultScryfallId: options?.defaultScryfallId,
  });
  printCache[cacheKey] = page.data;
  return printCache[cacheKey];
}

/** Apply printing identity onto an existing lean instance. */
export function applyPrintingToCard(
  card: CardInstance,
  printing: PrintingFields,
): CardInstance {
  return {
    ...card,
    name: printing.name || card.name,
    scryfallId: printing.scryfallId,
    setCode: printing.setCode || null,
    collectorNumber: printing.collectorNumber || null,
    foil: printing.foil,
  };
}
