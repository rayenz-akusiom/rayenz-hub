import {
  cardImageUrl,
  collectionIdentifierForCard,
  fetchCardsCollection,
  scryfallImageFromId,
  type GlanceCard,
  type GlanceLayoutPlan,
} from '@rayenz-hub/shared';

export const SCRYFALL_USER_AGENT = 'RayenzHub/1.0 (deck-glance; +https://github.com/rayenz-hub)';

const CDN_HOST = 'cards.scryfall.io';

export function isCdnImageUrl(url: string | null | undefined): boolean {
  return Boolean(url && url.includes(CDN_HOST));
}

function cardArtKey(card: Pick<GlanceCard, 'instanceId'>): string {
  return card.instanceId;
}

function printKey(card: Pick<GlanceCard, 'name' | 'setCode' | 'collectorNumber'>): string {
  return `${String(card.name || '').toLowerCase()}|${String(card.setCode || '').toLowerCase()}|${card.collectorNumber || ''}`;
}

/** Prefer direct CDN URLs; api.scryfall.com image redirects are resolved server-side. */
export function glanceImageUrlForCard(
  card: Pick<
    GlanceCard,
    'name' | 'setCode' | 'collectorNumber' | 'imageUrl'
  > & { scryfallId?: string | null },
): string | null {
  if (card.scryfallId) {
    return scryfallImageFromId(card.scryfallId) || card.imageUrl || null;
  }
  if (isCdnImageUrl(card.imageUrl)) return card.imageUrl;
  const derived = cardImageUrl({
    name: card.name,
    setCode: card.setCode,
    collectorNumber: card.collectorNumber,
    scryfallId: card.scryfallId ?? null,
    imageUrl: isCdnImageUrl(card.imageUrl) ? card.imageUrl : null,
  });
  return derived || card.imageUrl || null;
}

export async function enrichGlancePlanArt(
  plan: GlanceLayoutPlan,
  deckCards: Array<{
    instanceId: string;
    name: string;
    setCode: string | null;
    collectorNumber: string | null;
    scryfallId?: string | null;
  }>,
  fetchImpl: typeof fetch = fetch,
): Promise<GlanceLayoutPlan> {
  const deckById = new Map(deckCards.map((c) => [c.instanceId, c]));
  const needsLookup = new Map<string, ReturnType<typeof collectionIdentifierForCard>>();
  const idByPrint = new Map<string, string>();

  for (const placement of plan.placements) {
    const card = placement.card;
    const deckCard = deckById.get(card.instanceId);
    const scryfallId = deckCard?.scryfallId ?? null;
    const currentUrl = glanceImageUrlForCard({ ...card, scryfallId });
    if (isCdnImageUrl(currentUrl)) continue;

    const ident = collectionIdentifierForCard({
      scryfallId,
      setCode: card.setCode,
      collectorNumber: card.collectorNumber,
      name: card.name,
    });
    if (!ident) continue;
    const key = printKey(card);
    if (!needsLookup.has(key)) needsLookup.set(key, ident);
  }

  if (needsLookup.size > 0) {
    const { data } = await fetchCardsCollection([...needsLookup.values()], {
      fetchImpl: (input, init) =>
        fetchImpl(input, {
          ...init,
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'User-Agent': SCRYFALL_USER_AGENT,
            ...(init?.headers || {}),
          },
        }),
    });
    for (const scryfallCard of data) {
      const key = `${String(scryfallCard.name || '').toLowerCase()}|${String(scryfallCard.set || '').toLowerCase()}|${scryfallCard.collector_number || ''}`;
      idByPrint.set(key, scryfallCard.id);
    }
  }

  const placements = plan.placements.map((placement) => {
    const deckCard = deckById.get(placement.card.instanceId);
    const scryfallId = deckCard?.scryfallId ?? idByPrint.get(printKey(placement.card)) ?? null;
    const imageUrl = glanceImageUrlForCard({ ...placement.card, scryfallId });
    if (imageUrl === placement.card.imageUrl) return placement;
    return {
      ...placement,
      card: { ...placement.card, imageUrl },
    };
  });

  return { ...plan, placements };
}

export async function fetchImageBytes(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Uint8Array | null> {
  if (!url) return null;
  try {
    const res = await fetchImpl(url, {
      headers: {
        Accept: 'image/*',
        'User-Agent': SCRYFALL_USER_AGENT,
      },
      redirect: 'follow',
    });
    if (!res.ok) return null;
    const type = res.headers.get('content-type') || '';
    if (!type.startsWith('image/')) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

/** Prefetch unique card art bytes keyed by instanceId. */
export async function prefetchGlanceImages(
  plan: GlanceLayoutPlan,
  fetchImpl: typeof fetch = fetch,
): Promise<Map<string, Uint8Array>> {
  const unique = new Map<string, string>();
  for (const placement of plan.placements) {
    const url = placement.card.imageUrl;
    if (!url) continue;
    unique.set(cardArtKey(placement.card), url);
  }

  const entries = [...unique.entries()];
  const fetched = await mapWithConcurrency(entries, 10, async ([instanceId, url]) => {
    const bytes = await fetchImageBytes(url, fetchImpl);
    return [instanceId, bytes] as const;
  });

  const cache = new Map<string, Uint8Array>();
  for (const [instanceId, bytes] of fetched) {
    if (bytes) cache.set(instanceId, bytes);
  }
  return cache;
}

export function createGlanceImageLoader(
  imageCache: Map<string, Uint8Array>,
  fetchImpl: typeof fetch = fetch,
): (url: string, card?: Pick<GlanceCard, 'instanceId' | 'name'>) => Promise<Uint8Array | null> {
  return async (url, card) => {
    if (card?.instanceId && imageCache.has(card.instanceId)) {
      return imageCache.get(card.instanceId)!;
    }
    const bytes = await fetchImageBytes(url, fetchImpl);
    if (bytes && card?.instanceId) imageCache.set(card.instanceId, bytes);
    return bytes;
  };
}
