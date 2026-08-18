import {
  isTheoryDeck,
  maybeAttachScryfallTags,
  SET_POOL_FORMAT_VERSION,
  SCRYFALL_SUGGEST_POOL_FILTERS,
  type DeckSummary,
} from '@rayenz-hub/shared';
import {
  buildDeckRuleContext,
  ensureSetPoolIndexed,
  hubDeckToRecord,
  indexSetPool,
  parseYamlProfile,
  resolveDeckEligibility,
} from '@rayenz-hub/shared/suggest';
import {
  clearSetPoolCache,
  hydrateSetPoolFromApi,
  loadSetPoolCache,
  normalizeSetCodesKey,
  saveSetPoolCache,
} from '../lib/hub-storage';
import { sleep } from '../lib/hub-utils';
import { ArchidektExport } from '../mtg/archidekt-export';
import { ProfileSync } from '../mtg/profile-sync';
import { pullRemoteLibraryUpdates, resolveLibraryDocument, listFallbackLibrary } from '../deck-builder/store/library-sync';
import { isApiConfigured } from '../api/hub-api';
import { readLibrarySort, sortLibraryDecks } from '../deck-builder/library/library-sort';
import type { DeckProfile, DeckRecord, SetScope, SnapshotCard } from './types';

export {
  buildDeckRuleContext,
  ensureSetPoolIndexed,
  getDeckSwapQueue,
  hubDeckToRecord,
  indexSetPool,
  parseYamlProfile,
  resolveDeckEligibility,
} from '@rayenz-hub/shared/suggest';

const setPoolCache: Record<string, SetScope> = {};

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

export function tryRestoreSetPool(codesKey: string): SetScope | null {
  if (!codesKey) {
    return null;
  }
  if (setPoolCache[codesKey]) {
    const cached = setPoolCache[codesKey] as SetScope & { formatVersion?: number };
    if (Number(cached.formatVersion || 0) < SET_POOL_FORMAT_VERSION) {
      delete setPoolCache[codesKey];
    } else {
      return ensureSetPoolIndexed(cached)!;
    }
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
        'https://api.scryfall.com/cards/search?q=' +
        encodeURIComponent(
          `set:${code.toLowerCase()} unique:cards ${SCRYFALL_SUGGEST_POOL_FILTERS}`,
        ) +
        '&order=name&page=' +
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
          oracle_id: card.oracle_id != null ? String(card.oracle_id) : null,
          illustration_id: card.illustration_id != null ? String(card.illustration_id) : null,
          color_identity: Array.isArray(card.color_identity) ? (card.color_identity as string[]) : [],
        });
      });
      hasMore = json.has_more === true;
      page += 1;
      if (hasMore) {
        await sleep(100);
      }
    }
  }

  const tagged = await maybeAttachScryfallTags(cards);
  const scope = buildScopeFromCodes(normalized, tagged, 'scryfall');
  setPoolCache[codesKey] = scope;
  saveSetPoolCache(codesKey, {
    ...scope,
    complete: scope.complete ?? true,
    formatVersion: SET_POOL_FORMAT_VERSION,
  });
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
    saveSetPoolCache(scope.codesKey, {
      ...scope,
      complete: scope.complete ?? true,
      formatVersion: SET_POOL_FORMAT_VERSION,
    });
  }
  return scope;
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

/** Load commander decks from the Hub library for Deck Suggest. */
export async function loadHubLibraryDecks(): Promise<DeckRecord[]> {
  let summaries: DeckSummary[];
  try {
    summaries = await pullRemoteLibraryUpdates();
  } catch (err) {
    if (isApiConfigured()) {
      throw err instanceof Error ? err : new Error('Could not load library from Hub API.');
    }
    summaries = await listFallbackLibrary();
  }
  summaries = sortLibraryDecks(summaries, readLibrarySort());
  const decks: DeckRecord[] = [];
  for (const s of summaries) {
    if (s.format !== 'commander') continue;
    if (isTheoryDeck(s)) continue;
    const doc = await resolveLibraryDocument(s.deckId);
    if (!doc || isTheoryDeck(doc)) continue;
    decks.push(hubDeckToRecord(doc));
  }
  return decks;
}

export function clearDataSetPoolCache(): void {
  Object.keys(setPoolCache).forEach((k) => delete setPoolCache[k]);
}
