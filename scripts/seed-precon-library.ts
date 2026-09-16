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
  MTGJSON_COMMANDER_DECK_TYPE,
  PRECONS_USERNAME,
  buildPreconFromMtgjson,
  documentFromMtgjsonDeck,
  categoryFromMtgjsonCard,
  loadMtgjsonCommanderDeckList,
  loadMtgjsonDeck,
  uniquifyMtgjsonDeckNames,
  type BuiltMtgjsonPrecon,
  type DeckDocument,
} from '../packages/shared/src/index.ts';
import { signInHubSession } from './hub-cli-session.ts';

export { documentFromMtgjsonDeck, categoryFromMtgjsonCard };

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

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  console.log(
    `Precon seed: type="${MTGJSON_COMMANDER_DECK_TYPE}" dryRun=${opts.dryRun} limit=${opts.limit ?? 'all'}`,
  );

  let entries = await loadMtgjsonCommanderDeckList({ userAgent: USER_AGENT });
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

  const displayNames = uniquifyMtgjsonDeckNames(entries);
  const built: BuiltMtgjsonPrecon[] = [];
  const failures: { fileName: string; error: string }[] = [];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    try {
      const deck = await loadMtgjsonDeck(entry.fileName, { userAgent: USER_AGENT });
      const name = displayNames.get(entry.fileName) || entry.name;
      const row = buildPreconFromMtgjson(entry, deck, name);
      built.push(row);
      if (row.missingPrintings > 0) {
        console.warn(
          `  warn ${entry.fileName}: ${row.missingPrintings} card(s) missing scryfallId and set+cn`,
        );
      }
      console.log(
        `  [${i + 1}/${entries.length}] ${name} — ${row.document.cards.length} cards (cmd=${(deck.commander || []).length})`,
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
