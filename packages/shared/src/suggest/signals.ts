import type { SetPoolCard, SnapshotCard, TaggerContext } from './types';

function normalizeText(value: string | null | undefined): string {
  return String(value || '').toLowerCase();
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

export function countTagOverlap(
  card: SnapshotCard | SetPoolCard,
  tags: string[] | undefined,
  taggerCtx: TaggerContext | null | undefined,
): number {
  if (!tags || !tags.length) {
    return 0;
  }
  const resolved = taggerCtx && taggerCtx.resolve ? taggerCtx.resolve(card.name || '', card) : null;
  const blob = cardTextBlob(card);
  const taggerTags = [
    ...((resolved && resolved.taggerTags) || []),
    ...cardStoredTags(card),
  ];
  let count = 0;
  tags.forEach((tag) => {
    const t = normalizeText(tag);
    if (!t) {
      return;
    }
    if (taggerTags.some((tt) => normalizeText(tt) === t || normalizeText(tt).indexOf(t) >= 0)) {
      count += 1;
      return;
    }
    if (blob.indexOf(t) >= 0) {
      count += 1;
    }
  });
  return count;
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
    const res = resolve(name, card);
    const stored = cardStoredTags(card);
    if ((res.taggerTags && res.taggerTags.length) || stored.length) {
      withTags += 1;
    }
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
  };
}
