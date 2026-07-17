import { deriveSwapQueue, hasMaybeboardOnlySwapQueue, type DeckWithSnapshot } from '@rayenz-hub/shared';
import {
  clearSetPoolCache,
  hydrateSetPoolFromApi,
  loadSetPoolCache,
  normalizeSetCodesKey,
  saveSetPoolCache,
} from '../lib/hub-storage';
import { bridgeAvailable, sleep } from '../lib/hub-utils';
import { ArchidektExport } from '../mtg/archidekt-export';
import { OrderReconcileExport } from '../mtg/order-reconcile-export';
import { ProfileSync } from '../mtg/profile-sync';
import type { DeckProfile, DeckRecord, SetScope, SnapshotCard } from './types';

const setPoolCache: Record<string, SetScope> = {};

function parseFolderId(url: string): number | null {
  const match = String(url || '').match(/archidekt\.com\/folders\/(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

export function parseYamlProfile(text: string): DeckProfile {
  const profile: DeckProfile = { roles: [], protected_cards: [], blocked_cards: [] };
  let currentList: 'protected_cards' | 'blocked_cards' | null = null;
  let currentRole: { id: string; priority?: string; tags?: string[] } | null = null;
  String(text || '')
    .split(/\r?\n/)
    .forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.charAt(0) === '#') {
        return;
      }
      if (trimmed === 'roles:') {
        return;
      }
      if (trimmed.indexOf('- id:') === 0) {
        currentRole = { id: trimmed.replace('- id:', '').trim(), tags: [] };
        profile.roles!.push(currentRole);
        return;
      }
      if (currentRole && trimmed.indexOf('priority:') === 0) {
        currentRole.priority = trimmed.replace('priority:', '').trim();
        return;
      }
      if (currentRole && trimmed.indexOf('tags:') === 0) {
        const tagMatch = trimmed.match(/\[(.*)\]/);
        if (tagMatch) {
          currentRole.tags = tagMatch[1]
            .split(',')
            .map((t) => t.trim().replace(/^['"]|['"]$/g, ''))
            .filter(Boolean);
        }
        return;
      }
      if (trimmed === 'protected_cards:') {
        currentList = 'protected_cards';
        return;
      }
      if (trimmed === 'blocked_cards:') {
        currentList = 'blocked_cards';
        return;
      }
      if (trimmed.indexOf('deck_id:') === 0) {
        profile.deck_id = trimmed.replace('deck_id:', '').trim();
        return;
      }
      if (trimmed.indexOf('format:') === 0) {
        profile.format = trimmed.replace('format:', '').trim();
        return;
      }
      if (trimmed.indexOf('- ') === 0 && currentList) {
        profile[currentList]!.push(trimmed.replace('- ', '').trim().replace(/^['"]|['"]$/g, ''));
      }
    });
  return profile;
}

export function resolveDeckEligibility(deck: DeckRecord) {
  const profile = deck.profile || {};
  const format = profile.format;
  if (format && format !== 'commander') {
    return {
      eligible: false,
      reason: 'non_commander_format',
      message: deck.deck_name + ': skipped (profile format is ' + format + ').',
    };
  }
  if (OrderReconcileExport.isCubeDeck(deck)) {
    return {
      eligible: false,
      reason: 'cube_or_non_commander',
      message: deck.deck_name + ': skipped (cube deck — out of scope for v1).',
    };
  }
  if (hasMaybeboardOnlySwapQueue(deck.deck_snapshot as DeckWithSnapshot['deck_snapshot'])) {
    return {
      eligible: false,
      reason: 'maybeboard_swap_queue',
      message: deck.deck_name + ': skipped (Maybeboard-only swap queue).',
    };
  }
  if (format === 'commander') {
    return { eligible: true, format: 'commander' };
  }
  return { eligible: true, format: 'commander', inferred: true };
}

function buildScopeFromCodes(codes: string[], cards: SetScope['cards'], source?: string): SetScope {
  const upper = codes.map((c) => String(c).toUpperCase());
  const codesKey = normalizeSetCodesKey(upper);
  return indexSetPool({
    primaryCode: upper[0],
    codes: upper,
    codesKey,
    setName: upper.join('/'),
    cards,
    fetchedAt: new Date().toISOString().slice(0, 10),
    source: source || 'scryfall',
    complete: true,
  })!;
}

export function indexSetPool(scope: SetScope | null): SetScope | null {
  if (!scope) {
    return scope;
  }
  if (scope.indexVersion === 1 && scope.cardsByName) {
    return scope;
  }
  const cardsByName: Record<string, SetScope['cards']> = {};
  (scope.cards || []).forEach((card) => {
    const key = String(card.name || '').toLowerCase();
    if (!key) {
      return;
    }
    if (!cardsByName[key]) {
      cardsByName[key] = [];
    }
    cardsByName[key].push(card);
  });
  scope.cardsByName = cardsByName;
  scope.indexVersion = 1;
  return scope;
}

export function ensureSetPoolIndexed(scope: SetScope | null): SetScope | null {
  return indexSetPool(scope);
}

export function buildDeckRuleContext(deck: DeckRecord) {
  if (deck.ruleContext && deck.ruleContext.version === 1) {
    return deck.ruleContext;
  }
  const deckNames: Record<string, boolean> = {};
  ((deck.deck_snapshot && deck.deck_snapshot.cards) || []).forEach((card) => {
    if (card.name) {
      deckNames[card.name.toLowerCase()] = true;
    }
  });
  deck.ruleContext = {
    version: 1,
    swapQueue: deriveSwapQueue(deck as DeckWithSnapshot),
    deckNames,
    cutCandidates: null,
  };
  return deck.ruleContext;
}

export function getDeckSwapQueue(deck: DeckRecord) {
  return buildDeckRuleContext(deck).swapQueue;
}

export function tryRestoreSetPool(codesKey: string): SetScope | null {
  if (!codesKey) {
    return null;
  }
  if (setPoolCache[codesKey]) {
    return ensureSetPoolIndexed(setPoolCache[codesKey])!;
  }
  const stored = loadSetPoolCache(codesKey);
  if (stored) {
    setPoolCache[codesKey] = ensureSetPoolIndexed(stored as SetScope)!;
    return setPoolCache[codesKey];
  }
  return null;
}

export async function fetchSetPool(
  codes: string[],
  options: { forceRefresh?: boolean } = {},
): Promise<SetScope> {
  const normalized = (codes || [])
    .map((c) => String(c).trim().toUpperCase())
    .filter(Boolean);
  if (!normalized.length) {
    throw new Error('Enter at least one set code.');
  }
  const codesKey = normalizeSetCodesKey(normalized);
  if (!options.forceRefresh) {
    const cached = tryRestoreSetPool(codesKey);
    if (cached) {
      return cached;
    }
    const fromApi = await hydrateSetPoolFromApi(codesKey);
    if (fromApi) {
      setPoolCache[codesKey] = ensureSetPoolIndexed(fromApi as SetScope)!;
      return setPoolCache[codesKey];
    }
  } else {
    clearSetPoolCache(codesKey);
    delete setPoolCache[codesKey];
  }

  const cards: SetScope['cards'] = [];
  const seen: Record<string, boolean> = {};
  for (let i = 0; i < normalized.length; i += 1) {
    const code = normalized[i];
    let page = 1;
    let hasMore = true;
    while (hasMore) {
      const url =
        'https://api.scryfall.com/cards/search?q=set:' +
        encodeURIComponent(code.toLowerCase()) +
        '&unique=prints&order=name&page=' +
        page;
      const resp = await fetch(url);
      if (!resp.ok) {
        throw new Error('Scryfall set fetch failed for ' + code + ' (' + resp.status + ')');
      }
      const json = (await resp.json()) as {
        data?: Array<Record<string, unknown>>;
        has_more?: boolean;
      };
      (json.data || []).forEach((card) => {
        const oracleKey = String(card.name).toLowerCase();
        if (seen[oracleKey]) {
          return;
        }
        seen[oracleKey] = true;
        cards.push({
          name: String(card.name),
          set_code: String(card.set || code).toUpperCase(),
          collector_number: String(card.collector_number || ''),
          scryfall_id: card.id as string,
          scryfall_uri: card.scryfall_uri as string,
          mana_cost: (card.mana_cost as string) || '',
          cmc: card.cmc != null ? (card.cmc as number) : 0,
          type_line: (card.type_line as string) || '',
          oracle_text: (card.oracle_text as string) || '',
          keywords: (card.keywords as string[]) || [],
        });
      });
      hasMore = json.has_more === true;
      page += 1;
      if (hasMore) {
        await sleep(100);
      }
    }
  }

  const scope = buildScopeFromCodes(normalized, cards, 'scryfall');
  setPoolCache[codesKey] = scope;
  saveSetPoolCache(codesKey, { ...scope, complete: scope.complete ?? true });
  return scope;
}

export function loadSetScopeFromUpload(json: Record<string, unknown>): SetScope {
  let codes = ((json.codes as string[]) || []).map((c) => String(c).toUpperCase());
  if (!codes.length && json.primaryCode) {
    codes = [String(json.primaryCode).toUpperCase()];
  }
  const scope = indexSetPool({
    primaryCode: String(json.primaryCode || codes[0] || '').toUpperCase(),
    codes,
    codesKey: normalizeSetCodesKey(codes),
    setName: (json.setName as string) || 'Uploaded set',
    cards: (json.cards as SetScope['cards']) || [],
    fetchedAt: (json.fetchedAt as string) || new Date().toISOString().slice(0, 10),
    source: 'upload',
    complete: true,
  })!;
  if (scope.codesKey) {
    setPoolCache[scope.codesKey] = scope;
    saveSetPoolCache(scope.codesKey, { ...scope, complete: scope.complete ?? true });
  }
  return scope;
}

type ArchidektBridge = {
  fetchFolder?: (folderId: number) => Promise<DeckRecord[]>;
  fetchDeckSnapshot?: (deckId: number) => Promise<DeckRecord['deck_snapshot']>;
};

function getBridge(): ArchidektBridge | undefined {
  return (window as Window & { RayenzArchidektBridge?: ArchidektBridge }).RayenzArchidektBridge;
}

export async function loadDeckRegistry(folderUrl: string): Promise<DeckRecord[]> {
  if (!bridgeAvailable() || typeof getBridge()?.fetchFolder !== 'function') {
    throw new Error('Install Archidekt Deck Review Bridge userscript for folder fetch.');
  }
  const folderId = parseFolderId(folderUrl);
  if (!folderId) {
    throw new Error('Invalid Archidekt folder URL.');
  }
  return getBridge()!.fetchFolder!(folderId);
}

export async function fetchDeckSnapshot(url: string) {
  if (!bridgeAvailable()) {
    throw new Error('Install Archidekt Deck Review Bridge userscript for live Archidekt fetch.');
  }
  const deckId = ArchidektExport.parseDeckId(url);
  if (!deckId) {
    throw new Error('Invalid Archidekt URL: ' + url);
  }
  return getBridge()!.fetchDeckSnapshot!(deckId);
}

export async function readProfileForDeck(deckId: string): Promise<DeckProfile | null> {
  try {
    const text = await ProfileSync.readProfileYaml(deckId);
    return text ? parseYamlProfile(text) : null;
  } catch {
    return null;
  }
}

export async function enrichDeckWithProfile(deck: DeckRecord): Promise<DeckRecord> {
  let profile = deck.profile;
  if (!profile && deck.deck_id) {
    profile = (await readProfileForDeck(deck.deck_id)) || undefined;
  }
  deck.profile = profile || deck.profile || {};
  if (!deck.format) {
    deck.format = deck.profile.format || 'commander';
  }
  const eligibility = resolveDeckEligibility(deck);
  deck.eligibility = eligibility;
  if (eligibility.eligible && deck.deck_snapshot) {
    buildDeckRuleContext(deck);
  }
  return deck;
}

export function attachProfileLists(deck: DeckRecord) {
  const profile = deck.profile || {};
  deck.profile_preferences = {
    protected_cards: profile.protected_cards || [],
    blocked_cards: profile.blocked_cards || [],
  };
  return deck;
}

function humanizeSlug(slug: string): string {
  return String(slug || '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function deckNameFromUrl(url: string): string {
  const slugMatch = String(url || '').match(/archidekt\.com\/decks\/\d+\/([^/?#]+)/i);
  if (slugMatch) {
    return humanizeSlug(slugMatch[1]);
  }
  const deckId = ArchidektExport.parseDeckId(url);
  return deckId ? 'Deck ' + deckId : 'Deck';
}

export function parseDeckListFromText(text: string): DeckRecord[] {
  const lines = String(text || '').split(/\r?\n/);
  const decks: DeckRecord[] = [];
  const seen: Record<string, boolean> = {};
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.charAt(0) === '#') {
      return;
    }
    let url = trimmed;
    if (url.indexOf('http') !== 0) {
      url = 'https://archidekt.com/decks/' + url.replace(/^\/+/, '');
    }
    const deckId = ArchidektExport.parseDeckId(url);
    if (!deckId) {
      throw new Error('Invalid Archidekt deck URL: ' + trimmed);
    }
    if (seen[deckId]) {
      return;
    }
    seen[deckId] = true;
    decks.push({
      deck_id: 'deck-' + deckId,
      deck_name: deckNameFromUrl(url),
      archidekt_url: url,
    });
  });
  if (!decks.length) {
    throw new Error('Paste at least one Archidekt deck URL (one per line).');
  }
  return decks;
}

export function buildDeckFromImportText(
  text: string,
  options: { deck_id?: string; deck_name?: string; archidekt_url?: string } = {},
): DeckRecord {
  const cards = ArchidektExport.parseImportText(text);
  let deckId = options.deck_id;
  if (!deckId && options.archidekt_url) {
    const parsedId = ArchidektExport.parseDeckId(options.archidekt_url);
    deckId = parsedId ? 'deck-' + parsedId : undefined;
  }
  if (!deckId) {
    deckId = 'paste-import-' + Date.now();
  }
  return {
    deck_id: deckId,
    deck_name: options.deck_name || 'Pasted deck',
    archidekt_url: options.archidekt_url || '',
    format: 'commander',
    deck_snapshot: {
      fetched_at: new Date().toISOString().slice(0, 10),
      source: 'paste-import',
      cards: cards as SnapshotCard[],
    },
  };
}

export function clearDataSetPoolCache(): void {
  Object.keys(setPoolCache).forEach((k) => delete setPoolCache[k]);
}
