import type { SetPoolCard, SnapshotCard, TaggerContext } from './types';
import { normalizeFocusTags } from './focus-filter';

const CARD_TYPE_WORDS = new Set([
  'instant',
  'sorcery',
  'creature',
  'artifact',
  'enchantment',
  'land',
  'planeswalker',
  'battle',
  'tribal',
  'kindred',
]);

function normalizeText(value: string | null | undefined): string {
  return String(value || '').toLowerCase();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function cardTextBlob(
  card: SnapshotCard | SetPoolCard | { name?: string; type_line?: string; oracle_text?: string; keywords?: string[] },
): string {
  return normalizeText([card.type_line, card.oracle_text, (card.keywords || []).join(' ')].join(' '));
}

export function cardStoredTags(card: SnapshotCard | SetPoolCard | undefined): string[] {
  if (!card) return [];
  const pool = card as SetPoolCard;
  const tags = [...(pool.oracle_tags || []), ...(pool.tags || [])];
  return tags.filter(Boolean);
}

/** True when Scryfall oracle tagging was attached to this card. */
export function hasScryfallOracleTags(card: SnapshotCard | SetPoolCard | undefined): boolean {
  return cardStoredTags(card).length > 0;
}

/** Strip parenthetical reminder text used for untagged rules-text fallback. */
export function stripReminderText(oracleText: string | null | undefined): string {
  let text = String(oracleText || '');
  let prev = '';
  while (text !== prev) {
    prev = text;
    text = text.replace(/\s*\([^()]*\)/g, ' ');
  }
  return text.replace(/\s+/g, ' ').trim();
}

export function oracleTextForFallback(
  card: SnapshotCard | SetPoolCard | { oracle_text?: string } | undefined,
): string {
  return normalizeText(stripReminderText(card?.oracle_text));
}

const ABILITY_COUNTER_KINDS = [
  'loyalty',
  'charge',
  'oil',
  'lore',
  'time',
  'stun',
  'shield',
  'keyword',
  'finality',
  'blight',
  'isolation',
];

const SPELL_COUNTER_RE =
  /\bcounter(?:ed)?\s+(?:target|that|it)\b|\bcounter (?:a|this) spell\b|\b(?:can'?t|cannot) be countered\b|\bwould be countered\b|\bis countered\b/i;

const STAT_COUNTER_RE = new RegExp(
  [
    '[+-]\\d+\\/[+-]\\d+\\s+counters?\\b',
    '\\b(?:' + ABILITY_COUNTER_KINDS.join('|') + ')\\s+counters?\\b',
    '\\bput\\s+(?:a|an|\\d+|that many)\\s+(?:[\\w+/\\-]+\\s+)?counters?\\s+on\\b',
    '\\bremove\\s+(?:a|an|\\d+)\\s+(?:[\\w+/\\-]+\\s+)?counters?\\b',
    '\\bproliferate\\b',
  ].join('|'),
  'i',
);

function hyphenSegments(slug: string): string[] {
  return normalizeText(slug)
    .split(/[-_]+/)
    .filter(Boolean);
}

/** Exact or hyphen-segment match; `counter` may alias `counterspell`, not `counters`. */
export function tagSlugMatches(tagSlug: string, needle: string): boolean {
  const tt = normalizeText(tagSlug);
  const n = normalizeText(needle).trim();
  if (!tt || !n) return false;
  if (tt === n) return true;
  const segs = hyphenSegments(tt);
  if (segs.includes(n)) return true;
  if (n === 'counter' && (tt === 'counterspell' || segs.includes('counterspell'))) return true;
  return false;
}

function counterTextFamily(needle: string): 'spell' | 'stat' | null {
  const n = normalizeText(needle).trim().replace(/_/g, '-');
  if (n === 'counter' || n === 'counterspell' || n === 'counter-spell') return 'spell';
  if (n === 'counters' || n === 'proliferate') return 'stat';
  if (n.includes('+1/+1') || n.includes('plus-one-plus-one') || n.includes('plus-1-plus-1')) return 'stat';
  if (n.endsWith('-counters') || n.endsWith('-counter')) return 'stat';
  if (ABILITY_COUNTER_KINDS.some((kind) => n === kind || n.startsWith(kind + '-'))) return 'stat';
  return null;
}

/** Word-boundary match; card-type words never hit via rules text. Counter needles use phrase families. */
export function textMatchesNeedle(text: string, needle: string): boolean {
  const n = normalizeText(needle).trim();
  if (!n || !text || CARD_TYPE_WORDS.has(n)) return false;
  const family = counterTextFamily(n);
  if (family === 'spell') return SPELL_COUNTER_RE.test(text);
  if (family === 'stat') return STAT_COUNTER_RE.test(text);
  const escaped = escapeRegExp(n).replace(/[-_]+/g, '[-_\\s]+').replace(/\s+/g, '\\s+');
  return new RegExp('\\b' + escaped + '\\b', 'i').test(text);
}

export type TagMatchResult = {
  count: number;
  matched: string[];
  source: 'oracle_tags' | 'text_fallback' | 'none';
};

export function matchTagNeedles(
  card: SnapshotCard | SetPoolCard,
  tags: string[] | undefined,
): TagMatchResult {
  const needles = (tags || []).map((t) => String(t || '').trim()).filter(Boolean);
  if (!needles.length) {
    return { count: 0, matched: [], source: 'none' };
  }
  const stored = cardStoredTags(card);
  if (stored.length) {
    const matched: string[] = [];
    needles.forEach((tag) => {
      const t = normalizeText(tag);
      if (stored.some((tt) => tagSlugMatches(tt, t))) {
        matched.push(tag);
      }
    });
    return {
      count: matched.length,
      matched,
      source: 'oracle_tags',
    };
  }

  const printed = ((card as SetPoolCard).keywords || []).map((k) => String(k || ''));
  const fallbackText = oracleTextForFallback(card);
  const matched: string[] = [];
  needles.forEach((tag) => {
    const t = normalizeText(tag);
    if (printed.some((k) => tagSlugMatches(k, t))) {
      matched.push(tag);
      return;
    }
    if (textMatchesNeedle(fallbackText, t)) {
      matched.push(tag);
    }
  });
  return {
    count: matched.length,
    matched,
    source: matched.length ? 'text_fallback' : 'none',
  };
}

export function countTagOverlap(
  card: SnapshotCard | SetPoolCard,
  tags: string[] | undefined,
  _taggerCtx?: TaggerContext | null,
): number {
  return matchTagNeedles(card, tags).count;
}

export function resolveCardTags(cardName: string, card?: SnapshotCard | SetPoolCard) {
  const tags: string[] = [];
  const keywords = (card && card.keywords) || [];
  keywords.forEach((k) => {
    if (tags.indexOf(k) < 0) {
      tags.push(k);
    }
  });
  cardStoredTags(card).forEach((t) => {
    if (tags.indexOf(t) < 0) {
      tags.push(t);
    }
  });
  if (card && card.type_line) {
    card.type_line
      .split(/[—\-]/)
      .slice(1)
      .join(' ')
      .split(/\s+/)
      .forEach((part) => {
        const p = part.replace(/[^a-zA-Z]/g, '');
        if (p.length > 2 && tags.indexOf(p) < 0) {
          tags.push(p);
        }
      });
  }
  return {
    cardName,
    taggerTags: tags,
    source: tags.length ? 'fallback' : 'fallback',
  };
}

export function createContext(
  deck: { deck_snapshot?: { cards?: SnapshotCard[] } },
  setScope: { cards?: SetPoolCard[] } | null,
  opts?: { focusTags?: string[] },
): TaggerContext {
  const cache: TaggerContext['cache'] = {};
  let withTags = 0;
  let total = 0;

  function resolve(name: string, card?: SnapshotCard | SetPoolCard) {
    const key = normalizeText(name);
    if (!cache[key]) {
      cache[key] = resolveCardTags(name, card);
    }
    return cache[key];
  }

  function track(name: string, card?: SnapshotCard | SetPoolCard) {
    total += 1;
    const stored = cardStoredTags(card);
    if (stored.length) {
      withTags += 1;
    }
    resolve(name, card);
  }

  ((deck.deck_snapshot && deck.deck_snapshot.cards) || []).forEach((c) => {
    track(c.name || '', c);
  });
  ((setScope && setScope.cards) || []).forEach((c) => {
    track(c.name, c);
  });

  return {
    resolve,
    cache,
    coverage: {
      cardsResolved: total,
      cardsWithTags: withTags,
      percent: total ? Math.round((withTags / total) * 100) : 0,
    },
    focusTags: normalizeFocusTags(opts?.focusTags),
  };
}
