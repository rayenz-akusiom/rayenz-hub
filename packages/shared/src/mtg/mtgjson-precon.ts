/**
 * MTGJSON Commander precon → Hub DeckDocument mappers (shared by CLI seed + release-ensure worker).
 */
import {
  DeckDocumentSchema,
  type CardInstance,
  type CategoryDef,
  type DeckDocument,
} from '../schemas/deck-builder.js';
import { emptyCardOracle, oracleKey, upsertOracle } from '../deck-builder/card-oracle.js';
import { ensureCategoryDef } from '../deck-builder/card-edits.js';
import { normalizeCardQuantities } from '../deck-builder/quantities.js';
import { normalizeColourIdentity } from '../deck-builder/color-identity-map.js';
import { provisionalLayoutFromCard, scryfallImageFromId } from '../deck-builder/scryfall-images.js';
import { toKebabCase } from '../usernames.js';

export const MTGJSON_API_BASE = 'https://mtgjson.com/api/v5';
export const MTGJSON_COMMANDER_DECK_TYPE = 'Commander Deck';

export interface MtgjsonDeckListEntry {
  code: string;
  fileName: string;
  name: string;
  releaseDate: string | null;
  type: string;
}

export interface MtgjsonCardDeck {
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

export interface MtgjsonDeck {
  code?: string;
  name?: string;
  releaseDate?: string | null;
  type?: string;
  commander?: MtgjsonCardDeck[];
  mainBoard?: MtgjsonCardDeck[];
  sideBoard?: MtgjsonCardDeck[];
  tokens?: unknown[] | null;
}

export interface BuiltMtgjsonPrecon {
  deckId: string;
  name: string;
  slug: string;
  fileName: string;
  setCode: string;
  document: DeckDocument;
  missingPrintings: number;
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

export function uniquifyMtgjsonDeckNames(
  entries: Pick<MtgjsonDeckListEntry, 'fileName' | 'name' | 'code'>[],
): Map<string, string> {
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

export function preconDeckIdFromFileName(fileName: string): string {
  return `precon-${fileName}`;
}

function cardFromMtgjson(
  raw: MtgjsonCardDeck,
  primaryCategory: string,
  instanceId: string,
): { card: CardInstance; missingPrinting: boolean } {
  const name = String(raw.name || 'Unknown').trim() || 'Unknown';
  const setCode = raw.setCode ? String(raw.setCode).toLowerCase() : null;
  const collectorNumber = raw.number != null ? String(raw.number) : null;
  const scryfallId = raw.identifiers?.scryfallId?.trim() || null;
  const missingPrinting = !scryfallId && !(setCode && collectorNumber);

  const card: CardInstance = {
    instanceId,
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
  opts: {
    deckId: string;
    name: string;
    fileName: string;
    code: string;
    releaseDate: string | null;
    now?: string;
    nextId?: (prefix: string) => string;
  },
): { document: DeckDocument; missingPrintings: number } {
  const now = opts.now || new Date().toISOString();
  let seq = 0;
  const nextId =
    opts.nextId ||
    ((prefix: string) => {
      seq += 1;
      return `${prefix}-${Date.now()}-${seq}`;
    });

  let oracle: DeckDocument['oracle'] = {};
  let categories: CategoryDef[] = [];
  const rawCards: CardInstance[] = [];
  let missingPrintings = 0;
  let idx = 0;

  const pushCard = (raw: MtgjsonCardDeck, primaryCategory: string) => {
    const { card, missingPrinting } = cardFromMtgjson(raw, primaryCategory, nextId(`c${idx++}`));
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

export function buildPreconFromMtgjson(
  entry: MtgjsonDeckListEntry,
  deck: MtgjsonDeck,
  displayName: string,
): BuiltMtgjsonPrecon {
  const deckId = preconDeckIdFromFileName(entry.fileName);
  const { document, missingPrintings } = documentFromMtgjsonDeck(deck, {
    deckId,
    name: displayName,
    fileName: entry.fileName,
    code: entry.code,
    releaseDate: entry.releaseDate,
  });
  return {
    deckId,
    name: displayName,
    slug: toKebabCase(displayName),
    fileName: entry.fileName,
    setCode: String(entry.code || '').toUpperCase(),
    document,
    missingPrintings,
  };
}

export function filterCommanderDecksForSet(
  entries: MtgjsonDeckListEntry[],
  setCode: string,
): MtgjsonDeckListEntry[] {
  const code = setCode.trim().toUpperCase();
  return entries.filter(
    (e) =>
      e &&
      e.type === MTGJSON_COMMANDER_DECK_TYPE &&
      e.fileName &&
      String(e.code || '').toUpperCase() === code,
  );
}

export async function fetchMtgjsonJson<T>(
  url: string,
  userAgent: string,
  fetchImpl: typeof fetch = fetch,
): Promise<T> {
  const res = await fetchImpl(url, {
    headers: { Accept: 'application/json', 'User-Agent': userAgent },
  });
  if (!res.ok) {
    throw new Error(`GET ${url} → ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

export async function loadMtgjsonCommanderDeckList(
  opts?: { userAgent?: string; fetchImpl?: typeof fetch; baseUrl?: string },
): Promise<MtgjsonDeckListEntry[]> {
  const base = opts?.baseUrl || MTGJSON_API_BASE;
  const ua = opts?.userAgent || 'rayenz-hub-mtgjson/1.0';
  const payload = await fetchMtgjsonJson<{ data: MtgjsonDeckListEntry[] }>(
    `${base}/DeckList.json`,
    ua,
    opts?.fetchImpl,
  );
  const list = Array.isArray(payload.data) ? payload.data : [];
  return list.filter((e) => e && e.type === MTGJSON_COMMANDER_DECK_TYPE && e.fileName);
}

export async function loadMtgjsonDeck(
  fileName: string,
  opts?: { userAgent?: string; fetchImpl?: typeof fetch; baseUrl?: string },
): Promise<MtgjsonDeck> {
  const base = opts?.baseUrl || MTGJSON_API_BASE;
  const ua = opts?.userAgent || 'rayenz-hub-mtgjson/1.0';
  const payload = await fetchMtgjsonJson<{ data: MtgjsonDeck }>(
    `${base}/decks/${encodeURIComponent(fileName)}.json`,
    ua,
    opts?.fetchImpl,
  );
  if (!payload.data) {
    throw new Error(`No data for deck ${fileName}`);
  }
  return payload.data;
}
