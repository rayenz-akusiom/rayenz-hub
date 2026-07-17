#!/usr/bin/env node
/**
 * One-shot (re-runnable) seed: load deck profiles + Archidekt lists into local Hub API.
 *
 * Usage:
 *   npm run seed:local-library
 *   npx tsx scripts/seed-local-library.ts --profiles-dir "C:\Users\...\mtg\decks\profiles"
 *   npx tsx scripts/seed-local-library.ts --api-url http://127.0.0.1:3000 --api-key test-api-key-local
 *
 * Prerequisites: DynamoDB Local, MinIO bucket, and `npm run start:api` on :3000.
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { homedir } from 'node:os';
import {
  DeckDocumentSchema,
  detectDeckFormat,
  emptyCardOracle,
  normalizeCardQuantities,
  normalizeColourIdentity,
  oracleKey,
  provisionalLayoutFromCard,
  scryfallImageFromId,
  seedFormalSwapsFromCategories,
  upsertOracle,
  type CardInstance,
  type CategoryDef,
  type DeckDocument,
} from '../packages/shared/src/index.ts';

const ARCHIDEKT_API = 'https://archidekt.com/api';
const USER_AGENT = 'rayenz-hub-seed-local-library/1.0';
const REQUEST_DELAY_MS = 150;
const DEFAULT_API_URL = 'http://127.0.0.1:3000';
const DEFAULT_API_KEY = 'test-api-key-local';
const DEFAULT_PROFILES_DIR = path.join(homedir(), 'mtg', 'decks', 'profiles');

interface CliOptions {
  profilesDir: string;
  apiUrl: string;
  apiKey: string;
}

interface ProfileMeta {
  deckId: string;
  name: string;
  formatHint: string | null;
  archidektUrl: string;
  protectedCards: string[];
  blockedCards: string[];
  yaml: string;
  filePath: string;
}

interface ArchidektSnapshot {
  deck_id?: number | null;
  name?: string | null;
  deck_name?: string | null;
  url?: string | null;
  categories?: { name: string; includedInDeck?: boolean; includedInPrice?: boolean }[];
  category_settings?: Record<string, { includedInDeck?: boolean; includedInPrice?: boolean }>;
  cards?: Record<string, unknown>[];
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    profilesDir: DEFAULT_PROFILES_DIR,
    apiUrl: process.env.HUB_API_URL || DEFAULT_API_URL,
    apiKey: process.env.HUB_API_KEY || DEFAULT_API_KEY,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--profiles-dir') {
      opts.profilesDir = argv[++i] ?? opts.profilesDir;
    } else if (arg === '--api-url') {
      opts.apiUrl = argv[++i] ?? opts.apiUrl;
    } else if (arg === '--api-key') {
      opts.apiKey = argv[++i] ?? opts.apiKey;
    }
  }
  return opts;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseScalar(text: string, field: string): string | null {
  const re = new RegExp(`^${field}:\\s*(.+?)\\s*$`, 'm');
  const m = text.match(re);
  if (!m) return null;
  return m[1].replace(/^['"]|['"]$/g, '').trim();
}

function parseYamlList(text: string, fieldName: string): string[] {
  const items: string[] = [];
  let inSection = false;
  for (const line of text.split(/\r?\n/)) {
    if (/^[^\s#]/.test(line) && !line.startsWith('-')) {
      inSection = line.trim() === `${fieldName}:`;
      continue;
    }
    if (inSection) {
      if (/^[^\s#-]/.test(line)) break;
      const match = line.match(/^\s*-\s+(.+?)\s*$/);
      if (match) {
        items.push(match[1].trim().replace(/^['"]|['"]$/g, ''));
      }
    }
  }
  return items;
}

function parseArchidektDeckId(url: string): number {
  const match = url.match(/archidekt\.com\/decks\/(\d+)/i);
  if (!match) {
    throw new Error(`Invalid Archidekt deck URL: ${url}`);
  }
  return Number(match[1]);
}

function normalizeArchidektCategoryName(name: string): string {
  const trimmed = String(name || '').trim();
  if (trimmed === 'Lieutenant') return 'Lieutenants';
  return trimmed;
}

function dedupeCategoryDefs(categories: CategoryDef[]): CategoryDef[] {
  const byName = new Map<string, CategoryDef>();
  for (const c of categories) {
    const name = normalizeArchidektCategoryName(c.name);
    const prev = byName.get(name);
    if (!prev) {
      byName.set(name, { ...c, name });
      continue;
    }
    byName.set(name, {
      name,
      includedInDeck: prev.includedInDeck !== false && c.includedInDeck !== false,
      includedInPrice: prev.includedInPrice !== false && c.includedInPrice !== false,
    });
  }
  return [...byName.values()];
}

function categoriesFromSettings(
  settings: Record<string, { includedInDeck?: boolean; includedInPrice?: boolean }> | undefined,
): CategoryDef[] {
  if (!settings || typeof settings !== 'object') return [];
  return dedupeCategoryDefs(
    Object.entries(settings).map(([name, v]) => ({
      name: normalizeArchidektCategoryName(name),
      includedInDeck: v?.includedInDeck !== false,
      includedInPrice: v?.includedInPrice !== false,
    })),
  );
}

function parseFoil(raw: Record<string, unknown>): boolean {
  if (raw.foil === true) return true;
  if (typeof raw.modifier === 'string' && raw.modifier === 'Foil') return true;
  return false;
}

function typeLineFromArchidektCard(raw: Record<string, unknown>): string | null {
  const asString = (value: unknown): string | null => {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  };
  return asString(raw.type_line) || asString(raw.typeLine) || null;
}

let idSeq = 0;
function nextId(prefix: string): string {
  idSeq += 1;
  return `${prefix}-${Date.now()}-${idSeq}`;
}

function buildCategories(rawDeck: Record<string, unknown>): CategoryDef[] {
  const cats = (rawDeck.categories as { name?: string; includedInDeck?: boolean; includedInPrice?: boolean }[]) || [];
  return dedupeCategoryDefs(
    cats
      .filter((c) => c && c.name)
      .map((c) => ({
        name: normalizeArchidektCategoryName(String(c.name)),
        includedInDeck: c.includedInDeck !== false,
        includedInPrice: c.includedInPrice !== false,
      })),
  );
}

function buildCategorySettings(
  rawDeck: Record<string, unknown>,
): Record<string, { includedInDeck?: boolean; includedInPrice?: boolean }> {
  const map: Record<string, { includedInDeck?: boolean; includedInPrice?: boolean }> = {};
  for (const cat of (rawDeck.categories as { name?: string; includedInDeck?: boolean; includedInPrice?: boolean }[]) || []) {
    if (!cat?.name) continue;
    map[cat.name] = {
      includedInDeck: cat.includedInDeck !== false,
      includedInPrice: cat.includedInPrice !== false,
    };
  }
  return map;
}

function buildSnapshot(rawDeck: Record<string, unknown>): ArchidektSnapshot {
  const cards: Record<string, unknown>[] = [];
  for (const entry of (rawDeck.cards as Record<string, unknown>[]) || []) {
    if (entry.deletedAt) continue;
    const card = (entry.card as Record<string, unknown>) || {};
    const oracle = (card.oracleCard as Record<string, unknown>) || {};
    const name = oracle.name;
    if (!name) continue;
    const cats = (entry.categories as string[]) || [];
    const primary = cats.length ? cats[0] : null;
    const edition = (card.edition as Record<string, unknown>) || {};
    const setCode = edition.editioncode || edition.editionCode;
    const colorIdentity = oracle.colorIdentity;
    cards.push({
      id: entry.id != null ? entry.id : null,
      name,
      quantity: entry.quantity || 1,
      set_code: setCode ? String(setCode).toLowerCase() : null,
      collector_number: card.collectorNumber != null ? String(card.collectorNumber) : null,
      primary_category: primary,
      categories: cats,
      color_identity: Array.isArray(colorIdentity) ? colorIdentity.slice() : [],
      type_line: oracle.typeLine || null,
      foil: entry.foil === true || entry.modifier === 'Foil',
      scryfall_id: card.uid || null,
    });
  }
  const deckId = rawDeck.id != null ? Number(rawDeck.id) : null;
  return {
    deck_id: deckId,
    deck_name: (rawDeck.name as string) || null,
    name: (rawDeck.name as string) || null,
    url: deckId != null ? `https://archidekt.com/decks/${deckId}` : null,
    cards,
    categories: buildCategories(rawDeck),
    category_settings: buildCategorySettings(rawDeck),
  };
}

function documentFromSnapshot(
  snapshot: ArchidektSnapshot,
  opts: { deckId: string; name: string; formatHint: string | null },
): DeckDocument {
  const now = new Date().toISOString();
  const archidektId = Number(snapshot.deck_id) || null;
  const format = detectDeckFormat({
    name: opts.name,
    format: opts.formatHint === 'commander' || opts.formatHint === 'cube' || opts.formatHint === 'other'
      ? opts.formatHint === 'other'
        ? undefined
        : opts.formatHint
      : undefined,
  });

  let categories: CategoryDef[] = dedupeCategoryDefs(
    (snapshot.categories || []).map((c) => ({
      name: normalizeArchidektCategoryName(c.name),
      includedInDeck: c.includedInDeck !== false,
      includedInPrice: c.includedInPrice !== false,
    })),
  );
  if (!categories.length) {
    categories = categoriesFromSettings(snapshot.category_settings);
  }

  let oracle: DeckDocument['oracle'] = {};

  const rawCards: CardInstance[] = (snapshot.cards || []).map((raw, idx) => {
    const cats = [
      ...new Set(
        (
          Array.isArray(raw.categories)
            ? (raw.categories as string[])
            : raw.primary_category
              ? [String(raw.primary_category)]
              : ['Main']
        ).map(normalizeArchidektCategoryName),
      ),
    ];
    const primary = normalizeArchidektCategoryName(String(raw.primary_category || cats[0] || 'Main'));
    const scryfallId =
      (raw.scryfall_id as string) || (raw.scryfallId as string) || (raw.uid as string) || null;
    const name = String(raw.name || 'Unknown');
    const typeLine = typeLineFromArchidektCard(raw);
    const ci = normalizeColourIdentity(raw.color_identity ?? raw.colourIdentity ?? raw.colorIdentity);

    const card: CardInstance = {
      instanceId: String(raw.id || raw.archidektCardId || `c-${idx}-${Date.now()}`),
      name,
      quantity: Number(raw.quantity) || 1,
      primaryCategory: primary,
      categories: cats,
      stack: (raw.stack as string) || null,
      setCode: (raw.set_code as string) || (raw.setCode as string) || null,
      collectorNumber:
        raw.collector_number != null
          ? String(raw.collector_number)
          : raw.collectorNumber != null
            ? String(raw.collectorNumber)
            : null,
      scryfallId,
      archidektCardId: raw.id != null ? Number(raw.id) : null,
      foil: parseFoil(raw),
    };

    oracle = upsertOracle(oracle, oracleKey(card), {
      scryfallId,
      colourIdentity: ci,
      typeLine,
      layout: provisionalLayoutFromCard(name, typeLine),
      keywords: null,
      partnerWith: null,
      oracleText: null,
      imageUrl: scryfallId ? scryfallImageFromId(scryfallId) : null,
    });

    return card;
  });

  const cards = normalizeCardQuantities(rawCards, format, nextId);
  const formalSwapEntries = seedFormalSwapsFromCategories(cards, []);

  return DeckDocumentSchema.parse({
    schemaVersion: 1,
    deckId: opts.deckId,
    name: opts.name,
    format,
    archidektId,
    archidektUrl: snapshot.url || null,
    categories,
    cards,
    oracle,
    formalSwapEntries,
    browseViewDefault: null,
    cardLayoutDefault: 'stacked',
    createdAt: now,
    updatedAt: now,
    lastArchidektSyncAt: null,
    lastArchidektImportAt: now,
  });
}

async function fetchJson(url: string): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
  });
  if (!res.ok) {
    throw new Error(`GET ${url} → ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as Record<string, unknown>;
}

async function apiRequest(
  apiUrl: string,
  apiKey: string,
  method: string,
  route: string,
  body?: unknown,
): Promise<unknown> {
  const res = await fetch(`${apiUrl.replace(/\/$/, '')}${route}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${method} ${route} → ${res.status}: ${text.slice(0, 400)}`);
  }
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function parseProfile(filePath: string, yaml: string): ProfileMeta {
  const deckId = parseScalar(yaml, 'deck_id');
  const name = parseScalar(yaml, 'name');
  const archidektUrl = parseScalar(yaml, 'archidekt_url');
  const formatHint = parseScalar(yaml, 'format');
  if (!deckId) throw new Error(`${filePath}: missing deck_id`);
  if (!name) throw new Error(`${filePath}: missing name`);
  if (!archidektUrl) throw new Error(`${filePath}: missing archidekt_url`);
  return {
    deckId,
    name,
    formatHint,
    archidektUrl,
    protectedCards: parseYamlList(yaml, 'protected_cards'),
    blockedCards: parseYamlList(yaml, 'blocked_cards'),
    yaml,
    filePath,
  };
}

async function loadProfiles(profilesDir: string): Promise<ProfileMeta[]> {
  const entries = await readdir(profilesDir);
  const yamlFiles = entries.filter((f) => f.endsWith('.yaml')).sort();
  if (!yamlFiles.length) {
    throw new Error(`No .yaml profiles found in ${profilesDir}`);
  }
  const profiles: ProfileMeta[] = [];
  for (const file of yamlFiles) {
    const filePath = path.join(profilesDir, file);
    const yaml = await readFile(filePath, 'utf8');
    profiles.push(parseProfile(filePath, yaml));
  }
  return profiles;
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  console.log(`Profiles dir: ${opts.profilesDir}`);
  console.log(`API: ${opts.apiUrl}`);

  const profiles = await loadProfiles(opts.profilesDir);
  console.log(`Found ${profiles.length} profile(s)\n`);

  let profilesOk = 0;
  let decksOk = 0;
  const failures: string[] = [];

  for (const profile of profiles) {
    const label = `${profile.deckId} (${profile.name})`;
    try {
      await apiRequest(opts.apiUrl, opts.apiKey, 'PUT', `/v1/profiles/${encodeURIComponent(profile.deckId)}`, {
        deckName: profile.name,
        formatVersion: 1,
        protectedCards: profile.protectedCards,
        blockedCards: profile.blockedCards,
        tags: [],
        yaml: profile.yaml,
      });
      profilesOk += 1;
      console.log(`✓ profile  ${label}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      failures.push(`profile ${label}: ${msg}`);
      console.error(`✗ profile  ${label}: ${msg}`);
      continue;
    }

    try {
      const archidektId = parseArchidektDeckId(profile.archidektUrl);
      await sleep(REQUEST_DELAY_MS);
      const raw = await fetchJson(`${ARCHIDEKT_API}/decks/${archidektId}/`);
      const snapshot = buildSnapshot(raw);
      const doc = documentFromSnapshot(snapshot, {
        deckId: profile.deckId,
        name: profile.name,
        formatHint: profile.formatHint,
      });
      await apiRequest(opts.apiUrl, opts.apiKey, 'PUT', `/v1/decks/${encodeURIComponent(profile.deckId)}`, doc);
      decksOk += 1;
      console.log(`✓ deck     ${label}  cards=${doc.cards.length} format=${doc.format}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      failures.push(`deck ${label}: ${msg}`);
      console.error(`✗ deck     ${label}: ${msg}`);
    }
  }

  console.log('\n--- Summary ---');
  console.log(`Profiles loaded: ${profilesOk}/${profiles.length}`);
  console.log(`Decks loaded:    ${decksOk}/${profiles.length}`);

  const listDecks = (await apiRequest(opts.apiUrl, opts.apiKey, 'GET', '/v1/decks')) as {
    decks?: unknown[];
  };
  const listProfiles = (await apiRequest(opts.apiUrl, opts.apiKey, 'GET', '/v1/profiles')) as {
    profiles?: unknown[];
  };
  const deckCount = listDecks?.decks?.length ?? 0;
  const profileCount = listProfiles?.profiles?.length ?? 0;
  console.log(`API list decks:     ${deckCount}`);
  console.log(`API list profiles:  ${profileCount}`);

  if (failures.length) {
    console.error(`\n${failures.length} failure(s):`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }

  if (deckCount !== profiles.length || profileCount !== profiles.length) {
    console.error(
      `\nCount mismatch: expected ${profiles.length} decks and profiles, got decks=${deckCount} profiles=${profileCount}`,
    );
    process.exit(1);
  }

  console.log('\nSeed complete.');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
