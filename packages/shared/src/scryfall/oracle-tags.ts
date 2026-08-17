const ACCEPTED_WEIGHTS = new Set(['very_strong', 'strong', 'median']);
const BULK_DATA_URL = 'https://api.scryfall.com/bulk-data';

export type ScryfallTagging = {
  oracle_id?: string | null;
  illustration_id?: string | null;
  weight?: string;
};

export type ScryfallTag = {
  slug?: string;
  label?: string;
  type?: string;
  taggings?: ScryfallTagging[];
};

export type ScryfallTagIndexes = {
  updatedAt: string;
  oracleById: Record<string, string[]>;
  artById: Record<string, string[]>;
};

type BulkDataItem = {
  type?: string;
  updated_at?: string;
  download_uri?: string;
};

type FetchLike = typeof fetch;

let memoryCache: ScryfallTagIndexes | null = null;
let inflight: Promise<ScryfallTagIndexes | null> | null = null;

export function resetScryfallTagIndexCache(): void {
  memoryCache = null;
  inflight = null;
}

export function isAcceptedTagWeight(weight: string | null | undefined): boolean {
  if (!weight) return true;
  return ACCEPTED_WEIGHTS.has(String(weight).toLowerCase());
}

function pushSlug(map: Record<string, string[]>, id: string | null | undefined, slug: string): void {
  const key = String(id || '').trim();
  if (!key || !slug) return;
  if (!map[key]) map[key] = [];
  if (!map[key].includes(slug)) map[key].push(slug);
}

export function indexOracleTags(tags: ScryfallTag[]): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const tag of tags || []) {
    const slug = String(tag.slug || tag.label || '').trim();
    if (!slug) continue;
    for (const tagging of tag.taggings || []) {
      if (!isAcceptedTagWeight(tagging.weight)) continue;
      pushSlug(map, tagging.oracle_id, slug);
    }
  }
  return map;
}

export function indexArtTags(tags: ScryfallTag[]): Record<string, string[]> {
  const map: Record<string, string[]> = {};
  for (const tag of tags || []) {
    const slug = String(tag.slug || tag.label || '').trim();
    if (!slug) continue;
    for (const tagging of tag.taggings || []) {
      if (!isAcceptedTagWeight(tagging.weight)) continue;
      pushSlug(map, tagging.illustration_id, slug);
    }
  }
  return map;
}

export function tagsForOracleId(
  index: Record<string, string[]> | null | undefined,
  oracleId: string | null | undefined,
): string[] {
  const key = String(oracleId || '').trim();
  if (!key || !index) return [];
  return index[key] ? index[key].slice() : [];
}

export function tagsForIllustrationId(
  index: Record<string, string[]> | null | undefined,
  illustrationId: string | null | undefined,
): string[] {
  const key = String(illustrationId || '').trim();
  if (!key || !index) return [];
  return index[key] ? index[key].slice() : [];
}

export function attachTagsToCard<
  T extends {
    oracle_id?: string | null;
    illustration_id?: string | null;
    oracle_tags?: string[];
    art_tags?: string[];
  },
>(card: T, indexes: ScryfallTagIndexes): T {
  const oracle = tagsForOracleId(indexes.oracleById, card.oracle_id);
  const art = tagsForIllustrationId(indexes.artById, card.illustration_id);
  return {
    ...card,
    oracle_tags: oracle.length ? oracle : card.oracle_tags,
    art_tags: art.length ? art : card.art_tags,
  };
}

function isBulkCatalog(data: unknown): data is { data: BulkDataItem[] } {
  if (!data || typeof data !== 'object') return false;
  const list = (data as { data?: unknown }).data;
  if (!Array.isArray(list) || !list.length) return false;
  return list.some((item) => item && typeof item === 'object' && typeof (item as BulkDataItem).download_uri === 'string');
}

function pickBulk(items: BulkDataItem[], kind: 'oracle' | 'art'): BulkDataItem | null {
  const match = items.find((item) => {
    const type = String(item.type || '').toLowerCase();
    if (kind === 'oracle') return type.includes('oracle') && type.includes('tag');
    return (type.includes('illustration') || type.includes('art')) && type.includes('tag');
  });
  return match && match.download_uri ? match : null;
}

async function fetchJson(url: string, fetchImpl: FetchLike): Promise<unknown> {
  const resp = await fetchImpl(url);
  if (!resp || !('ok' in resp) || !resp.ok) {
    throw new Error('Scryfall request failed: ' + url);
  }
  return resp.json();
}

export async function loadScryfallTagIndexes(opts?: {
  fetchImpl?: FetchLike;
}): Promise<ScryfallTagIndexes | null> {
  if (memoryCache) return memoryCache;
  if (inflight) return inflight;
  const fetchImpl = opts?.fetchImpl || fetch;
  inflight = (async () => {
    try {
      const catalog = await fetchJson(BULK_DATA_URL, fetchImpl);
      if (!isBulkCatalog(catalog)) return null;
      const oracleBulk = pickBulk(catalog.data, 'oracle');
      const artBulk = pickBulk(catalog.data, 'art');
      if (!oracleBulk && !artBulk) return null;
      const [oracleTags, artTags] = await Promise.all([
        oracleBulk?.download_uri
          ? (fetchJson(oracleBulk.download_uri, fetchImpl) as Promise<ScryfallTag[]>)
          : Promise.resolve([] as ScryfallTag[]),
        artBulk?.download_uri
          ? (fetchJson(artBulk.download_uri, fetchImpl) as Promise<ScryfallTag[]>)
          : Promise.resolve([] as ScryfallTag[]),
      ]);
      const indexes: ScryfallTagIndexes = {
        updatedAt: oracleBulk?.updated_at || artBulk?.updated_at || '',
        oracleById: Array.isArray(oracleTags) ? indexOracleTags(oracleTags) : {},
        artById: Array.isArray(artTags) ? indexArtTags(artTags) : {},
      };
      memoryCache = indexes;
      return indexes;
    } catch {
      return null;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export async function maybeAttachScryfallTags<
  T extends {
    oracle_id?: string | null;
    illustration_id?: string | null;
    oracle_tags?: string[];
    art_tags?: string[];
  },
>(cards: T[], opts?: { fetchImpl?: FetchLike }): Promise<T[]> {
  const indexes = await loadScryfallTagIndexes(opts);
  if (!indexes) return cards;
  return cards.map((card) => attachTagsToCard(card, indexes));
}
