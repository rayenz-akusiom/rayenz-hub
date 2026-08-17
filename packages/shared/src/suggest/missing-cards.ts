import type { DeckProfile, SetPoolCard, Suggestion, SuggestionSignals } from './types';

export type { DeckProfile, SetPoolCard };

const SKIP_TYPE_TOKENS = new Set([
  'legendary',
  'basic',
  'snow',
  'world',
  'ongoing',
  'token',
  'creature',
  'artifact',
  'enchantment',
  'instant',
  'sorcery',
  'land',
  'planeswalker',
  'battle',
  'kindred',
  'tribal',
  'conspiracy',
  'phenomenon',
  'plane',
  'scheme',
  'vanguard',
  'dungeon',
  'emblem',
  'host',
  'hero',
]);

export const MISSING_CARDS_INFO =
  'If this reasoning was already on the profile, the card may still have been skipped because other cards scored as better matches.';

export const LOZENGE_GROUPS = ['functional', 'keywords', 'types', 'art'] as const;
export type LozengeGroup = (typeof LOZENGE_GROUPS)[number];

export type ProfileLozenge = {
  group: LozengeGroup;
  value: string;
  state: 'existing' | 'plus' | 'minus';
};

export type ProfileLozengeUpdates = {
  themes: string[];
  keyword_interests: string[];
  typal_types: string[];
  art_tags: string[];
};

function uniqueCaseInsensitive(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const value = String(raw || '').trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

export function typeLineSubtypes(typeLine: string | null | undefined): string[] {
  const raw = String(typeLine || '').trim();
  if (!raw) return [];
  const dash = raw.split(/\s+[—–-]\s+/);
  const subtypeSide = dash.length > 1 ? dash.slice(1).join(' ') : '';
  if (!subtypeSide) return [];
  return uniqueCaseInsensitive(
    subtypeSide
      .split(/[\s/,]+/)
      .map((part) => part.replace(/[^a-zA-Z0-9 ']/g, '').trim())
      .filter((part) => part.length > 1 && !SKIP_TYPE_TOKENS.has(part.toLowerCase())),
  );
}

export function existingValuesByGroup(profile?: DeckProfile | null): Record<LozengeGroup, string[]> {
  const p = profile || {};
  const functional = uniqueCaseInsensitive([
    ...(p.themes || []),
    ...(p.tags || []),
    ...((p.roles || []).flatMap((role) => role.tags || [])),
  ]);
  return {
    functional,
    keywords: uniqueCaseInsensitive(p.keyword_interests || []),
    types: uniqueCaseInsensitive(p.typal_types || []),
    art: uniqueCaseInsensitive(p.art_tags || []),
  };
}

export function proposalsFromCard(card: {
  type_line?: string;
  keywords?: string[];
  oracle_tags?: string[];
  art_tags?: string[];
  tags?: string[];
}): Record<LozengeGroup, string[]> {
  return {
    functional: uniqueCaseInsensitive([...(card.oracle_tags || []), ...(card.tags || [])]),
    keywords: uniqueCaseInsensitive(card.keywords || []),
    types: typeLineSubtypes(card.type_line),
    art: uniqueCaseInsensitive(card.art_tags || []),
  };
}

export function lozengeKey(lozenge: Pick<ProfileLozenge, 'group' | 'value'>): string {
  return lozenge.group + ':' + lozenge.value.toLowerCase();
}

export function aggregateProfileLozenges(
  profile: DeckProfile | null | undefined,
  cards: Array<Parameters<typeof proposalsFromCard>[0]>,
): ProfileLozenge[] {
  const existing = existingValuesByGroup(profile);
  const existingKeys: Record<LozengeGroup, Set<string>> = {
    functional: new Set(existing.functional.map((v) => v.toLowerCase())),
    keywords: new Set(existing.keywords.map((v) => v.toLowerCase())),
    types: new Set(existing.types.map((v) => v.toLowerCase())),
    art: new Set(existing.art.map((v) => v.toLowerCase())),
  };
  const out: ProfileLozenge[] = [];
  for (const group of LOZENGE_GROUPS) {
    for (const value of existing[group]) {
      out.push({ group, value, state: 'existing' });
    }
    const proposed: string[] = [];
    for (const card of cards) {
      proposed.push(...proposalsFromCard(card)[group]);
    }
    for (const value of uniqueCaseInsensitive(proposed)) {
      if (existingKeys[group].has(value.toLowerCase())) continue;
      out.push({ group, value, state: 'minus' });
    }
  }
  return out;
}

export function lozengesByGroup(lozenges: ProfileLozenge[]): Array<{
  group: LozengeGroup;
  existing: ProfileLozenge[];
  proposed: ProfileLozenge[];
}> {
  return LOZENGE_GROUPS.map((group) => ({
    group,
    existing: lozenges.filter((l) => l.group === group && l.state === 'existing'),
    proposed: lozenges.filter((l) => l.group === group && (l.state === 'minus' || l.state === 'plus')),
  })).filter((row) => row.existing.length || row.proposed.length);
}

export function toggleProfileLozenge(lozenges: ProfileLozenge[], key: string): ProfileLozenge[] {
  return lozenges.map((lozenge) => {
    if (lozenge.state === 'existing' || lozengeKey(lozenge) !== key) return lozenge;
    return { ...lozenge, state: lozenge.state === 'plus' ? 'minus' : 'plus' };
  });
}

export function plusLozengesToProfileUpdates(lozenges: ProfileLozenge[] | undefined): ProfileLozengeUpdates {
  const updates: ProfileLozengeUpdates = {
    themes: [],
    keyword_interests: [],
    typal_types: [],
    art_tags: [],
  };
  for (const lozenge of lozenges || []) {
    if (lozenge.state !== 'plus') continue;
    if (lozenge.group === 'functional') updates.themes.push(lozenge.value);
    if (lozenge.group === 'keywords') updates.keyword_interests.push(lozenge.value);
    if (lozenge.group === 'types') updates.typal_types.push(lozenge.value);
    if (lozenge.group === 'art') updates.art_tags.push(lozenge.value);
  }
  return updates;
}

export function markLozengesExisting(
  lozenges: ProfileLozenge[] | undefined,
  confirmed: ProfileLozengeUpdates,
): ProfileLozenge[] {
  const keys = new Set<string>();
  for (const value of confirmed.themes) keys.add(lozengeKey({ group: 'functional', value }));
  for (const value of confirmed.keyword_interests) keys.add(lozengeKey({ group: 'keywords', value }));
  for (const value of confirmed.typal_types) keys.add(lozengeKey({ group: 'types', value }));
  for (const value of confirmed.art_tags) keys.add(lozengeKey({ group: 'art', value }));
  return (lozenges || []).map((lozenge) =>
    keys.has(lozengeKey(lozenge)) ? { ...lozenge, state: 'existing' as const } : lozenge,
  );
}

export function missingCardSuggestionId(deckId: string, card: SetPoolCard): string {
  const deck = String(deckId || 'deck').trim() || 'deck';
  const oracle = String(card.oracle_id || '').trim();
  if (oracle) return `missing:${deck}:${oracle}`;
  return [
    'missing',
    deck,
    String(card.name || '').trim().toLowerCase(),
    String(card.set_code || '').trim().toLowerCase(),
    String(card.collector_number || '').trim().toLowerCase(),
  ].join(':');
}

function signalsFromCard(card: SetPoolCard): SuggestionSignals {
  const proposals = proposalsFromCard(card);
  return {
    keywords: proposals.keywords,
    types: proposals.types,
    tags: [...proposals.functional, ...proposals.art],
  };
}

export function buildMissingCardSuggestion(
  card: SetPoolCard,
  profile: DeckProfile | null | undefined,
  opts: { deckId: string },
): Suggestion {
  return {
    suggestion_id: missingCardSuggestionId(opts.deckId, card),
    action: 'consider',
    card,
    quantity: 1,
    roles_matched: [],
    confidence: 'medium',
    rationale: 'Added from missing cards.',
    tags: ['rule:missing_cards'],
    replaces: [],
    priority_tier: 'normal',
    signals: signalsFromCard(card),
    source: 'missing_cards',
    profile_lozenges: aggregateProfileLozenges(profile, [card]),
  };
}

function nameSet(names: Array<string | undefined | null>): Set<string> {
  const set = new Set<string>();
  for (const name of names) {
    const key = String(name || '')
      .trim()
      .toLowerCase();
    if (key) set.add(key);
  }
  return set;
}

const COMMANDER_CATEGORIES = new Set(['Commander', 'Lieutenant', 'Lieutenants']);

function isCommanderSnapshotCard(card: {
  primary_category?: string;
  categories?: string[];
}): boolean {
  const primary = card.primary_category || (card.categories && card.categories[0]);
  return !!(primary && COMMANDER_CATEGORIES.has(primary));
}

/** Commander colour identity, or null when the deck has no commander/lieutenant. */
export function commanderIdentity(deck: {
  deck_snapshot?: {
    cards?: Array<{ primary_category?: string; categories?: string[]; color_identity?: string[] }>;
  };
}): string[] | null {
  const letters = new Set<string>();
  let found = false;
  for (const card of deck.deck_snapshot?.cards || []) {
    if (!isCommanderSnapshotCard(card)) continue;
    found = true;
    for (const c of card.color_identity || []) letters.add(String(c).toUpperCase());
  }
  if (!found) return null;
  return [...letters];
}

export function missingPoolCards(
  cards: SetPoolCard[],
  deck: {
    deck_id?: string;
    deck_snapshot?: {
      cards?: Array<{
        name?: string;
        primary_category?: string;
        categories?: string[];
        color_identity?: string[];
      }>;
    };
    suggestions?: Array<{ card?: { name?: string } }>;
  },
): SetPoolCard[] {
  const inDeck = nameSet(((deck.deck_snapshot && deck.deck_snapshot.cards) || []).map((c) => c.name));
  const suggested = nameSet(
    ((deck.suggestions || []) as Array<{ card?: { name?: string } }>).map((s) => s.card?.name),
  );
  const commanderId = commanderIdentity(deck);
  return (cards || []).filter((card) => {
    const key = String(card.name || '')
      .trim()
      .toLowerCase();
    if (!key) return false;
    if (inDeck.has(key) || suggested.has(key)) return false;
    if (commanderId) {
      const cardCi = (card.color_identity || card.colorIdentity || []).map((c) => String(c).toUpperCase());
      if (!cardCi.every((c) => commanderId.includes(c))) return false;
    }
    return true;
  });
}
