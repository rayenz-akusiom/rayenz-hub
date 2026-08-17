import type { ReleaseKind } from './release-catalog.js';
import { maybeAttachScryfallTags } from './oracle-tags.js';

/**
 * Scryfall + Wizards Collecting set resolution (shared by API + MCP).
 */

const SCRYFALL_API = 'https://api.scryfall.com';
const WIZARDS_BASE = 'https://magic.wizards.com/en/news/feature';
const USER_AGENT = 'rayenz-hub/1.0';
const REQUEST_DELAY_MS = 100;

const SET_CODE_PATTERN = /Set Code:\s*([A-Z0-9]{2,5})\b/gi;
const SET_CODE_LABEL_PATTERN = /(.+?)\s+Set Code:\s*([A-Z0-9]{2,5})\b/gi;

const PLAYABLE_SET_TYPES = new Set([
  'expansion',
  'core',
  'draft_innovation',
  'masters',
  'commander',
  'masterpiece',
]);

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  });
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status} for ${url}`) as Error & { status: number };
    err.status = res.status;
    throw err;
  }
  return res.json();
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' },
  });
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status} for ${url}`) as Error & { status: number };
    err.status = res.status;
    throw err;
  }
  const raw = await res.text();
  return raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
}

export function slugifySetName(name: string): string {
  let cleaned = name.replace(/^Magic:\s*The Gathering\s*\|\s*/i, '');
  cleaned = cleaned.trim().toLowerCase();
  cleaned = cleaned.replace(/[^a-z0-9]+/g, '-');
  return cleaned.replace(/^-+|-+$/g, '');
}

export function collectingUrlForName(name: string): string {
  return `${WIZARDS_BASE}/collecting-${slugifySetName(name)}`;
}

type ParsedSet = { code: string; label: string | null };

function filterParsedSets(parsed: ParsedSet[], name: string | null): ParsedSet[] {
  if (!name) return parsed;
  const query = name.toLowerCase();
  if (query.includes('aftermath')) return parsed;
  const filtered = parsed.filter((entry) => {
    const label = (entry.label || '').toLowerCase();
    return !(label.includes('aftermath') && !query.includes('aftermath'));
  });
  return filtered.length ? filtered : parsed;
}

export function parseSetCodesFromText(text: string): ParsedSet[] {
  const found: ParsedSet[] = [];
  const seen = new Set<string>();

  for (const match of text.matchAll(SET_CODE_LABEL_PATTERN)) {
    const label = match[1].trim().replace(/^[-:|\s]+|[-:|\s]+$/g, '');
    const code = match[2].toUpperCase();
    if (seen.has(code)) continue;
    seen.add(code);
    found.push({ code, label });
  }

  if (!found.length) {
    for (const match of text.matchAll(SET_CODE_PATTERN)) {
      const code = match[1].toUpperCase();
      if (seen.has(code)) continue;
      seen.add(code);
      found.push({ code, label: null });
    }
  }

  return found;
}

async function resolveViaWizards(
  name: string | null,
  url: string | null,
): Promise<{ collecting_article_url: string; parsed_sets: ParsedSet[] } | null> {
  const candidates: string[] = [];
  if (url) candidates.push(url);
  if (name) candidates.push(collectingUrlForName(name));

  for (const candidate of candidates) {
    try {
      const text = await fetchText(candidate);
      const parsed = filterParsedSets(parseSetCodesFromText(text), name);
      if (parsed.length) {
        return { collecting_article_url: candidate, parsed_sets: parsed };
      }
    } catch {
      // try next candidate
    }
  }
  return null;
}

export type ScryfallSetMeta = {
  code: string;
  name: string;
  set_type: string;
  card_count: number;
  released_at: string | null;
  scryfall_uri: string | null;
  parent_set_code: string | null;
};

export async function fetchSetMetadata(setCode: string): Promise<ScryfallSetMeta | null> {
  try {
    const data = (await fetchJson(`${SCRYFALL_API}/sets/${setCode.toLowerCase()}`)) as Record<
      string,
      unknown
    >;
    return {
      code: String(data.code || setCode).toUpperCase(),
      name: String(data.name || ''),
      set_type: String(data.set_type || ''),
      card_count: Number(data.card_count || 0),
      released_at: data.released_at != null ? String(data.released_at) : null,
      scryfall_uri: data.scryfall_uri != null ? String(data.scryfall_uri) : null,
      parent_set_code: data.parent_set_code
        ? String(data.parent_set_code).toUpperCase()
        : null,
    };
  } catch (e) {
    if ((e as { status?: number }).status === 404) return null;
    throw e;
  }
}

async function fetchAllSets(): Promise<Array<Record<string, unknown>>> {
  let url: string | null = `${SCRYFALL_API}/sets`;
  const sets: Array<Record<string, unknown>> = [];
  while (url) {
    const data = (await fetchJson(url)) as {
      data?: Array<Record<string, unknown>>;
      next_page?: string;
    };
    sets.push(...(data.data || []));
    url = data.next_page || null;
    if (url) await sleep(REQUEST_DELAY_MS);
  }
  return sets;
}

function scryfallExpandFamily(
  seedCodes: string[],
  allSets: Array<Record<string, unknown>>,
): string[] {
  const byCode = new Map(
    allSets.map((s) => [String(s.code || '').toUpperCase(), s] as const),
  );

  const isPlayable = (code: string) => {
    const meta = byCode.get(code.toUpperCase());
    return Boolean(meta && PLAYABLE_SET_TYPES.has(String(meta.set_type || '')));
  };

  const childrenOf = (parent: string) =>
    allSets
      .filter((s) => String(s.parent_set_code || '').toUpperCase() === parent.toUpperCase())
      .map((s) => String(s.code || '').toUpperCase());

  const expanded = new Set<string>();
  for (const raw of seedCodes) {
    const code = raw.toUpperCase();
    if (!byCode.has(code) || !isPlayable(code)) continue;
    expanded.add(code);
    const meta = byCode.get(code)!;
    const parent = String(meta.parent_set_code || '').toUpperCase();
    if (parent && isPlayable(parent)) {
      expanded.add(parent);
      for (const child of childrenOf(parent)) {
        if (isPlayable(child)) expanded.add(child);
      }
    }
    for (const child of childrenOf(code)) {
      if (isPlayable(child)) expanded.add(child);
    }
  }

  const typeOrder: Record<string, number> = {
    expansion: 0,
    core: 1,
    draft_innovation: 2,
    masters: 3,
    commander: 4,
    masterpiece: 5,
  };
  return [...expanded].sort((a, b) => {
    const ta = typeOrder[String(byCode.get(a)?.set_type || '')] ?? 9;
    const tb = typeOrder[String(byCode.get(b)?.set_type || '')] ?? 9;
    return ta - tb || a.localeCompare(b);
  });
}

async function enrichSets(
  codes: string[],
  parsedLabels: Record<string, string | null>,
): Promise<Array<ScryfallSetMeta & { label: string | null }>> {
  const sets: Array<ScryfallSetMeta & { label: string | null }> = [];
  for (const code of codes) {
    const meta = await fetchSetMetadata(code);
    if (!meta) continue;
    sets.push({ ...meta, label: parsedLabels[code.toUpperCase()] ?? null });
    await sleep(REQUEST_DELAY_MS);
  }
  return sets;
}

function pickPrimaryCode(sets: Array<{ code: string; set_type: string }>): string {
  for (const s of sets) {
    if (['expansion', 'core', 'draft_innovation', 'masters'].includes(s.set_type)) {
      return s.code.toUpperCase();
    }
  }
  return sets[0].code.toUpperCase();
}

export type ResolveSetsResult = {
  product_name: string;
  primary_set_code: string;
  set_codes: string[];
  sets: Array<ScryfallSetMeta & { label: string | null }>;
  collecting_article_url: string | null | undefined;
  resolution_source: string;
};

export async function resolveSets(input: {
  name?: string | null;
  url?: string | null;
  seedCodes?: string[] | null;
  scryfallFallback?: boolean;
}): Promise<ResolveSetsResult> {
  const name = input.name || null;
  const url = input.url || null;
  const seedCodes = input.seedCodes || null;
  const scryfallFallback = input.scryfallFallback !== false;

  const wizards = await resolveViaWizards(name, url);
  const parsedLabels: Record<string, string | null> = {};
  let codes: string[] = [];
  let resolutionSource = 'unknown';
  let collectingUrl: string | null | undefined = url;

  if (wizards) {
    for (const entry of wizards.parsed_sets) {
      codes.push(entry.code);
      parsedLabels[entry.code] = entry.label;
    }
    resolutionSource = 'wizards_collecting_article';
    collectingUrl = wizards.collecting_article_url;
  } else if (seedCodes?.length) {
    codes = seedCodes.map((c) => c.toUpperCase());
    resolutionSource = 'seed_codes';
  } else {
    throw new Error('Could not resolve set codes. Provide a set name, Collecting URL, or seed code.');
  }

  if (scryfallFallback && !wizards) {
    const allSets = await fetchAllSets();
    const expanded = scryfallExpandFamily(codes, allSets);
    for (const code of expanded) {
      if (!codes.includes(code)) {
        codes.push(code);
        parsedLabels[code] ??= null;
      }
    }
    if (expanded.length) {
      resolutionSource = `${resolutionSource}+scryfall`;
    }
  }

  const enriched = await enrichSets(codes, parsedLabels);
  if (!enriched.length) {
    throw new Error('No valid set codes found on Scryfall.');
  }

  const finalCodes = enriched.map((s) => s.code);
  return {
    product_name: name || enriched[0].name,
    primary_set_code: pickPrimaryCode(enriched),
    set_codes: finalCodes,
    sets: enriched,
    collecting_article_url: collectingUrl,
    resolution_source: resolutionSource,
  };
}

export type NormalizedSetCard = {
  name: string;
  set_code: string;
  collector_number: string;
  scryfall_id: string;
  scryfall_uri: string | null;
  oracle_id: string | null;
  illustration_id: string | null;
  mana_cost: string;
  cmc: number;
  type_line: string;
  oracle_text: string;
  colors: string[];
  color_identity: string[];
  keywords: string[];
  legalities: Record<string, string>;
  produced_mana: string[];
  power: string | null;
  toughness: string | null;
  rarity: string | null;
  oracle_tags?: string[];
  art_tags?: string[];
};

/** Merge multi-face oracle text (adventures, MDFCs, split) for set-review tagging. */
export function analyzableOracleText(card: Record<string, unknown>): string {
  const top = typeof card.oracle_text === 'string' ? card.oracle_text.trim() : '';
  const faces = Array.isArray(card.card_faces) ? card.card_faces : [];
  const faceTexts = faces
    .map((face) => {
      if (!face || typeof face !== 'object') return '';
      const f = face as Record<string, unknown>;
      const text = typeof f.oracle_text === 'string' ? f.oracle_text.trim() : '';
      return text;
    })
    .filter(Boolean);
  if (!faceTexts.length) return top;
  if (!top) return faceTexts.join('\n');
  const merged = [top, ...faceTexts.filter((t) => !top.includes(t))];
  return merged.join('\n');
}

function normalizeCard(card: Record<string, unknown>): NormalizedSetCard {
  return {
    name: String(card.name || ''),
    set_code: String(card.set || '').toUpperCase(),
    collector_number: String(card.collector_number || ''),
    scryfall_id: String(card.id || ''),
    scryfall_uri: card.scryfall_uri != null ? String(card.scryfall_uri) : null,
    oracle_id: card.oracle_id != null ? String(card.oracle_id) : null,
    illustration_id: card.illustration_id != null ? String(card.illustration_id) : null,
    mana_cost: String(card.mana_cost || ''),
    cmc: Number(card.cmc || 0),
    type_line: String(card.type_line || ''),
    oracle_text: analyzableOracleText(card),
    colors: Array.isArray(card.colors) ? (card.colors as string[]) : [],
    color_identity: Array.isArray(card.color_identity)
      ? (card.color_identity as string[])
      : [],
    keywords: Array.isArray(card.keywords) ? (card.keywords as string[]) : [],
    legalities:
      card.legalities && typeof card.legalities === 'object'
        ? (card.legalities as Record<string, string>)
        : {},
    produced_mana: Array.isArray(card.produced_mana) ? (card.produced_mana as string[]) : [],
    power: card.power != null ? String(card.power) : null,
    toughness: card.toughness != null ? String(card.toughness) : null,
    rarity: card.rarity != null ? String(card.rarity) : null,
  };
}

/** Paper + Commander-legal only (excludes tokens, banned, and non-legal). */
export const SCRYFALL_SUGGEST_POOL_FILTERS = 'game:paper format:commander';

async function fetchAllCardsForSet(setCode: string): Promise<Record<string, unknown>[]> {
  // Use a space (→ %20), not '+': encodeURIComponent turns '+' into '%2B', which Scryfall treats literally and 404s.
  const query = encodeURIComponent(
    `set:${setCode.toLowerCase()} unique:cards ${SCRYFALL_SUGGEST_POOL_FILTERS}`,
  );
  let url: string | null = `${SCRYFALL_API}/cards/search?q=${query}`;
  const cards: Record<string, unknown>[] = [];
  while (url) {
    const data = (await fetchJson(url)) as {
      data?: Record<string, unknown>[];
      next_page?: string;
    };
    cards.push(...(data.data || []));
    url = data.next_page || null;
    if (url) await sleep(REQUEST_DELAY_MS);
  }
  return cards;
}

function dedupeCards(cards: NormalizedSetCard[]): NormalizedSetCard[] {
  const byOracle = new Map<string, NormalizedSetCard>();
  const order: string[] = [];
  for (const card of cards) {
    const key = card.oracle_id || card.scryfall_id;
    if (!byOracle.has(key)) {
      byOracle.set(key, card);
      order.push(key);
    }
  }
  return order.map((k) => byOracle.get(k)!);
}

export type FetchSetCardsResult = {
  product_name: string;
  primary_set_code: string;
  set_codes: string[];
  sets: Array<{
    set_code: string;
    set_name: string;
    scryfall_set_uri: string | null;
    expected_card_count: number;
    fetched_card_count: number;
    released_at: string | null;
    set_type: string;
  }>;
  expected_card_count: number;
  fetched_card_count: number;
  cards: NormalizedSetCard[];
};

export async function fetchSetCards(
  setCodes: string[],
  opts?: { dedupe?: boolean },
): Promise<FetchSetCardsResult> {
  const codes = setCodes.map((c) => c.toUpperCase());
  const perSet: FetchSetCardsResult['sets'] = [];
  const allCards: NormalizedSetCard[] = [];
  const dedupe = opts?.dedupe !== false;

  for (const code of codes) {
    const metadata = await fetchSetMetadata(code);
    if (!metadata) continue;
    const raw = await fetchAllCardsForSet(code);
    const normalized = raw.map(normalizeCard);
    perSet.push({
      set_code: code,
      set_name: metadata.name,
      scryfall_set_uri: metadata.scryfall_uri,
      expected_card_count: metadata.card_count,
      fetched_card_count: normalized.length,
      released_at: metadata.released_at,
      set_type: metadata.set_type,
    });
    allCards.push(...normalized);
    await sleep(REQUEST_DELAY_MS);
  }

  if (!perSet.length) {
    throw new Error('No valid sets fetched.');
  }

  const cardsOut = await maybeAttachScryfallTags(dedupe ? dedupeCards(allCards) : allCards);
  const primary =
    perSet.find((s) => ['expansion', 'core', 'masters'].includes(s.set_type)) || perSet[0];

  return {
    product_name: primary.set_name,
    primary_set_code: primary.set_code,
    set_codes: perSet.map((s) => s.set_code),
    sets: perSet,
    expected_card_count: perSet.reduce((n, s) => n + (s.expected_card_count || 0), 0),
    fetched_card_count: cardsOut.length,
    cards: cardsOut,
  };
}

/**
 * Fetch all unique cards in a Scryfall release using `g:` (group) or `b:` (block).
 * Example: g:ltr, b:zen, g:hob
 */
export async function fetchReleaseCards(
  kind: ReleaseKind,
  code: string,
  opts?: { dedupe?: boolean },
): Promise<FetchSetCardsResult> {
  const seed = code.trim().toLowerCase();
  if (!seed) throw new Error('Release code is required.');
  const prefix = kind === 'block' ? 'b' : 'g';
  // Use a space (→ %20), not '+': encodeURIComponent turns '+' into '%2B', which Scryfall treats literally and 404s.
  const query = encodeURIComponent(
    `${prefix}:${seed} unique:cards ${SCRYFALL_SUGGEST_POOL_FILTERS}`,
  );
  let url: string | null = `${SCRYFALL_API}/cards/search?q=${query}`;
  const raw: Record<string, unknown>[] = [];
  while (url) {
    const data = (await fetchJson(url)) as {
      data?: Record<string, unknown>[];
      next_page?: string;
      object?: string;
    };
    if (data.object === 'error') {
      throw new Error(`Scryfall found no cards for ${prefix}:${seed}`);
    }
    raw.push(...(data.data || []));
    url = data.next_page || null;
    if (url) await sleep(REQUEST_DELAY_MS);
  }
  if (!raw.length) {
    throw new Error(`No cards found for ${prefix}:${seed}`);
  }

  const normalized = raw.map(normalizeCard);
  const dedupe = opts?.dedupe !== false;
  const cardsOut = await maybeAttachScryfallTags(dedupe ? dedupeCards(normalized) : normalized);
  const codeSet = new Set(cardsOut.map((c) => c.set_code).filter(Boolean));
  const setCodes = [...codeSet].sort();
  const meta = await fetchSetMetadata(seed);
  const primary =
    setCodes.find((c) => c === seed.toUpperCase()) || (meta ? meta.code : setCodes[0]);

  return {
    product_name: meta?.name || `${prefix}:${seed}`,
    primary_set_code: primary,
    set_codes: setCodes,
    sets: setCodes.map((set_code) => ({
      set_code,
      set_name: set_code,
      scryfall_set_uri: null,
      expected_card_count: 0,
      fetched_card_count: cardsOut.filter((c) => c.set_code === set_code).length,
      released_at: null,
      set_type: '',
    })),
    expected_card_count: cardsOut.length,
    fetched_card_count: cardsOut.length,
    cards: cardsOut,
  };
}
