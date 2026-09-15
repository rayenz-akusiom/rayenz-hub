#!/usr/bin/env node
/**
 * Seed the `precons` Hub account with every MTGJSON paper Commander Deck.
 *
 * Usage:
 *   npx tsx scripts/seed-precon-library.ts
 *   npx tsx scripts/seed-precon-library.ts --dry-run --limit 3
 *   npx tsx scripts/seed-precon-library.ts --api-url https://… --username precons --password '…'
 *
 * Env: HUB_API_URL, HUB_USERNAME (default precons), HUB_PASSWORD
 *
 * Prod sequence (after API deploy with unlimited-cap support):
 *   1. HUB_PRECONS_PASSWORD=… HUB_PRECONS_EMAIL=… npm run provision:precons
 *   2. HUB_API_URL=… HUB_PASSWORD=… npm run seed:precon-library
 */
import {
  DeckDocumentSchema,
  emptyCardOracle,
  ensureCategoryDef,
  normalizeCardQuantities,
  normalizeColourIdentity,
  oracleKey,
  PRECONS_USERNAME,
  provisionalLayoutFromCard,
  scryfallImageFromId,
  toKebabCase,
  upsertOracle,
  type CardInstance,
  type CategoryDef,
  type DeckDocument,
} from '../packages/shared/src/index.ts';
import { signInHubSession } from './hub-cli-session.ts';

const MTGJSON_BASE = 'https://mtgjson.com/api/v5';
const COMMANDER_DECK_TYPE = 'Commander Deck';
const USER_AGENT = 'rayenz-hub-seed-precon-library/1.0';
const REQUEST_DELAY_MS = 120;
const DEFAULT_API_URL = 'http://127.0.0.1:3000';

interface CliOptions {
  apiUrl: string;
  username: string;
  password: string;
  dryRun: boolean;
  limit: number | null;
  fileName: string | null;
}

interface DeckListEntry {
  code: string;
  fileName: string;
  name: string;
  releaseDate: string | null;
  type: string;
}

interface MtgjsonCardDeck {
  name?: string;
  count?: number;
  number?: string;
  setCode?: string;
  isFoil?: boolean;
  type?: string;
  types?: string[];
  colorIdentity?: string[];
  identifiers?: { scryfallId?: string };
  uuid?: string;
}

interface MtgjsonDeck {
  code?: string;
  name?: string;
  releaseDate?: string | null;
  type?: string;
  commander?: MtgjsonCardDeck[];
  mainBoard?: MtgjsonCardDeck[];
  sideBoard?: MtgjsonCardDeck[];
  tokens?: unknown[] | null;
}

interface BuiltPrecon {
  deckId: string;
  name: string;
  slug: string;
  fileName: string;
  document: DeckDocument;
  missingPrintings: number;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    apiUrl: process.env.HUB_API_URL || DEFAULT_API_URL,
    username: process.env.HUB_USERNAME || PRECONS_USERNAME,
    password: process.env.HUB_PASSWORD || '',
    dryRun: false,
    limit: null,
    fileName: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--api-url') opts.apiUrl = argv[++i] ?? opts.apiUrl;
    else if (arg === '--username') opts.username = argv[++i] ?? opts.username;
    else if (arg === '--password') opts.password = argv[++i] ?? opts.password;
    else if (arg === '--dry-run') opts.dryRun = true;
    else if (arg === '--limit') {
      const n = Number(argv[++i]);
      opts.limit = Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
    } else if (arg === '--file') opts.fileName = argv[++i] ?? null;
  }
  return opts;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
  });
  if (!res.ok) {
    throw new Error(`GET ${url} → ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

async function apiPutDeck(
  apiUrl: string,
  accessToken: string,
  deckId: string,
  document: DeckDocument,
): Promise<void> {
  const res = await fetch(`${apiUrl.replace(/\/$/, '')}/v1/decks/${encodeURIComponent(deckId)}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(document),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`PUT /v1/decks/${deckId} → ${res.status}: ${text.slice(0, 400)}`);
  }
}

let idSeq = 0;
function nextId(prefix: string): string {
  idSeq += 1;
  return `${prefix}-${Date.now()}-${idSeq}`;
}

/** Prefer MTGJSON card types for Hub browse categories. */
export function categoryFromMtgjsonCard(card: MtgjsonCardDeck): string {
  const types = Array.isArray(card.types) ? card.types.map((t) => String(t)) : [];
  const typeLine = typeof card.type === 'string' ? card.type : types.join(' ');
  const hay = `${types.join(' ')} ${typeLine}`;
  if (/\bLand\b/i.test(hay)) return 'Land';
  if (/\bCreature\b/i.test(hay)) return 'Creature';
  if (/\bPlaneswalker\b/i.test(hay)) return 'Planeswalker';
  if (/\bBattle\b/i.test(hay)) return 'Battle';
  if (/\bArtifact\b/i.test(hay)) return 'Artifact';
  if (/\bEnchantment\b/i.test(hay)) return 'Enchantment';
  if (/\bInstant\b/i.test(hay)) return 'Instant';
  if (/\bSorcery\b/i.test(hay)) return 'Sorcery';
  return 'Other';
}

function uniquifyNames(entries: DeckListEntry[]): Map<string, string> {
  const counts = new Map<string, number>();
  for (const e of entries) {
    counts.set(e.name, (counts.get(e.name) || 0) + 1);
  }
  const names = new Map<string, string>();
  for (const e of entries) {
    const dup = (counts.get(e.name) || 0) > 1;
    names.set(e.fileName, dup ? `${e.name} (${e.code})` : e.name);
  }
  return names;
}

function cardFromMtgjson(
  raw: MtgjsonCardDeck,
  primaryCategory: string,
  idx: number,
): { card: CardInstance; missingPrinting: boolean } {
  const name = String(raw.name || 'Unknown').trim() || 'Unknown';
  const setCode = raw.setCode ? String(raw.setCode).toLowerCase() : null;
  const collectorNumber = raw.number != null ? String(raw.number) : null;
  const scryfallId = raw.identifiers?.scryfallId?.trim() || null;
  const missingPrinting = !scryfallId && !(setCode && collectorNumber);
  const typeLine = typeof raw.type === 'string' ? raw.type : null;
  const ci = normalizeColourIdentity(raw.colorIdentity);

  const card: CardInstance = {
    instanceId: nextId(`c${idx}`),
    name,
    quantity: Math.max(1, Number(raw.count) || 1),
    primaryCategory,
    categories: [primaryCategory],
    stack: null,
    setCode,
    collectorNumber,
    scryfallId,
    archidektCardId: null,
    foil: raw.isFoil === true,
    proxy: false,
  };

  return { card, missingPrinting };
}

export function documentFromMtgjsonDeck(
  deck: MtgjsonDeck,
  opts: { deckId: string; name: string; fileName: string; code: string; releaseDate: string | null },
): { document: DeckDocument; missingPrintings: number } {
  const now = new Date().toISOString();
  let oracle: DeckDocument['oracle'] = {};
  let categories: CategoryDef[] = [];
  const rawCards: CardInstance[] = [];
  let missingPrintings = 0;
  let idx = 0;

  const pushCard = (raw: MtgjsonCardDeck, primaryCategory: string) => {
    const { card, missingPrinting } = cardFromMtgjson(raw, primaryCategory, idx++);
    if (missingPrinting) missingPrintings += 1;
    categories = ensureCategoryDef(categories, primaryCategory);
    const typeLine = typeof raw.type === 'string' ? raw.type : null;
    const ci = normalizeColourIdentity(raw.colorIdentity);
    oracle = upsertOracle(oracle, oracleKey(card), {
      ...emptyCardOracle(),
      scryfallId: card.scryfallId,
      colourIdentity: ci,
      typeLine,
      layout: provisionalLayoutFromCard(card.name, typeLine),
      imageUrl: card.scryfallId ? scryfallImageFromId(card.scryfallId) : null,
    });
    rawCards.push(card);
  };

  for (const raw of deck.commander || []) {
    pushCard(raw, 'Commander');
  }
  for (const raw of deck.mainBoard || []) {
    pushCard(raw, categoryFromMtgjsonCard(raw));
  }

  const cards = normalizeCardQuantities(rawCards, 'commander', nextId);
  const release = opts.releaseDate || deck.releaseDate || null;
  const description = [
    `Official Commander precon (${opts.code}).`,
    release ? `Released ${release}.` : null,
    `MTGJSON: ${opts.fileName}.`,
  ]
    .filter(Boolean)
    .join(' ');

  const document = DeckDocumentSchema.parse({
    schemaVersion: 1,
    deckId: opts.deckId,
    name: opts.name,
    description,
    format: 'commander',
    ownership: 'owned',
    visibility: 'public',
    archidektId: null,
    archidektUrl: null,
    categories,
    cards,
    oracle,
    formalSwapEntries: [],
    lookingForEntries: [],
    browseViewDefault: null,
    cardLayoutDefault: 'stacked',
    cardSortDefault: 'name_asc',
    createdAt: now,
    updatedAt: now,
    lastArchidektSyncAt: null,
    lastArchidektImportAt: null,
  });

  return { document, missingPrintings };
}

async function loadCommanderDeckList(): Promise<DeckListEntry[]> {
  const payload = await fetchJson<{ data: DeckListEntry[] }>(`${MTGJSON_BASE}/DeckList.json`);
  const list = Array.isArray(payload.data) ? payload.data : [];
  return list.filter((e) => e && e.type === COMMANDER_DECK_TYPE && e.fileName);
}

async function loadDeck(fileName: string): Promise<MtgjsonDeck> {
  const payload = await fetchJson<{ data: MtgjsonDeck }>(
    `${MTGJSON_BASE}/decks/${encodeURIComponent(fileName)}.json`,
  );
  if (!payload.data) {
    throw new Error(`No data for deck ${fileName}`);
  }
  return payload.data;
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  console.log(
    `Precon seed: type="${COMMANDER_DECK_TYPE}" dryRun=${opts.dryRun} limit=${opts.limit ?? 'all'}`,
  );

  let entries = await loadCommanderDeckList();
  if (opts.fileName) {
    entries = entries.filter((e) => e.fileName === opts.fileName);
    if (!entries.length) {
      throw new Error(`No Commander Deck with fileName=${opts.fileName}`);
    }
  }
  entries.sort((a, b) => {
    const da = a.releaseDate || '';
    const db = b.releaseDate || '';
    if (da !== db) return da.localeCompare(db);
    return a.name.localeCompare(b.name);
  });
  if (opts.limit != null) {
    entries = entries.slice(0, opts.limit);
  }
  console.log(`Found ${entries.length} decks to process`);

  const displayNames = uniquifyNames(entries);
  const built: BuiltPrecon[] = [];
  const failures: { fileName: string; error: string }[] = [];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    try {
      const deck = await loadDeck(entry.fileName);
      const name = displayNames.get(entry.fileName) || entry.name;
      const deckId = `precon-${entry.fileName}`;
      const { document, missingPrintings } = documentFromMtgjsonDeck(deck, {
        deckId,
        name,
        fileName: entry.fileName,
        code: entry.code,
        releaseDate: entry.releaseDate,
      });
      built.push({
        deckId,
        name,
        slug: toKebabCase(name),
        fileName: entry.fileName,
        document,
        missingPrintings,
      });
      if (missingPrintings > 0) {
        console.warn(`  warn ${entry.fileName}: ${missingPrintings} card(s) missing scryfallId and set+cn`);
      }
      console.log(
        `  [${i + 1}/${entries.length}] ${name} — ${document.cards.length} cards (cmd=${(deck.commander || []).length})`,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      failures.push({ fileName: entry.fileName, error: msg });
      console.error(`  FAIL ${entry.fileName}: ${msg}`);
    }
    await sleep(REQUEST_DELAY_MS);
  }

  if (!opts.dryRun) {
    const token = await signInHubSession(opts.apiUrl, opts.username, opts.password);
    console.log(`Signed in as ${opts.username}; uploading ${built.length} decks…`);
    for (let i = 0; i < built.length; i++) {
      const row = built[i];
      try {
        await apiPutDeck(opts.apiUrl, token, row.deckId, row.document);
        console.log(`  PUT [${i + 1}/${built.length}] ${row.deckId}`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        failures.push({ fileName: row.fileName, error: msg });
        console.error(`  FAIL PUT ${row.fileName}: ${msg}`);
      }
      await sleep(REQUEST_DELAY_MS);
    }
  } else {
    console.log('Dry run — skipped Hub PUT');
  }

  console.log('\nSlug index (deep links):');
  for (const row of built) {
    console.log(`  #/commander-builder/${PRECONS_USERNAME}/${row.slug}\t${row.name}`);
  }
  console.log(
    `\nDone: built=${built.length} failures=${failures.length} dryRun=${opts.dryRun}`,
  );
  if (failures.length) {
    process.exitCode = 1;
  }
}

const isMain =
  process.argv[1] &&
  (process.argv[1].endsWith('seed-precon-library.ts') ||
    process.argv[1].endsWith('seed-precon-library.js'));

if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
