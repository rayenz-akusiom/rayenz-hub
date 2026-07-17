import type { CardInstance } from '../schemas/deck-builder.js';
import { normalizeColourIdentity, type ColourLetter } from './color-identity-map.js';
import { scryfallImageFromId } from './scryfall-images.js';

const SCYFALL_API = 'https://api.scryfall.com';
const PAGE_DELAY_MS = 90;

/** Minimal Scryfall card fields we use for search / printings. */
export type ScryfallCard = {
  id: string;
  name: string;
  set: string;
  collector_number: string;
  type_line?: string;
  color_identity?: string[];
  finishes?: string[];
  layout?: string;
};

export type ScryfallSearchPage = {
  data: ScryfallCard[];
  has_more: boolean;
  next_page: string | null;
  total_cards?: number;
};

export type PrintingFields = {
  name: string;
  scryfallId: string;
  setCode: string;
  collectorNumber: string;
  typeLine: string | null;
  colourIdentity: ColourLetter[];
  layout: string | null;
  foil: boolean;
};

const printCache: Record<string, ScryfallCard[]> = {};

export function clearScryfallPrintCache(): void {
  for (const key of Object.keys(printCache)) {
    delete printCache[key];
  }
}

export function buildSearchUrl(query: string, page = 1): string {
  const q = String(query || '').trim();
  const url = new URL(`${SCYFALL_API}/cards/search`);
  url.searchParams.set('q', q);
  if (page > 1) url.searchParams.set('page', String(page));
  return url.toString();
}

export function buildPrintingsSearchUrl(cardName: string): string {
  const name = String(cardName || '').trim();
  const url = new URL(`${SCYFALL_API}/cards/search`);
  url.searchParams.set('q', `!"${name}"`);
  url.searchParams.set('unique', 'prints');
  url.searchParams.set('order', 'released');
  return url.toString();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function parseError(res: Response, fallback: string): Promise<Error> {
  if (res.status === 429) {
    return new Error('Scryfall rate limit — try again in a moment.');
  }
  if (res.status === 404) {
    return new Error(fallback);
  }
  try {
    const body = (await res.json()) as { details?: string };
    if (body?.details) return new Error(body.details);
  } catch {
    /* ignore */
  }
  return new Error(fallback);
}

function asScryfallCard(raw: unknown): ScryfallCard | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Record<string, unknown>;
  if (typeof c.id !== 'string' || typeof c.name !== 'string') return null;
  return {
    id: c.id,
    name: c.name,
    set: typeof c.set === 'string' ? c.set : '',
    collector_number: c.collector_number != null ? String(c.collector_number) : '',
    type_line: typeof c.type_line === 'string' ? c.type_line : undefined,
    color_identity: Array.isArray(c.color_identity)
      ? (c.color_identity as string[])
      : undefined,
    finishes: Array.isArray(c.finishes) ? (c.finishes as string[]) : undefined,
    layout: typeof c.layout === 'string' ? c.layout : undefined,
  };
}

export function scryfallCardImageUrl(card: Pick<ScryfallCard, 'id'>): string {
  return scryfallImageFromId(card.id) || '';
}

export function mapScryfallCardToPrinting(
  card: ScryfallCard,
  opts?: { foil?: boolean },
): PrintingFields {
  const finishes = card.finishes || [];
  const wantFoil = Boolean(opts?.foil);
  const foil = wantFoil && finishes.includes('foil');
  return {
    name: card.name,
    scryfallId: card.id,
    setCode: card.set || '',
    collectorNumber: card.collector_number || '',
    typeLine: card.type_line || null,
    colourIdentity: normalizeColourIdentity(card.color_identity || []),
    layout: card.layout || null,
    foil,
  };
}

export function printingSupportsFoil(card: ScryfallCard): boolean {
  return (card.finishes || []).includes('foil');
}

export async function searchCards(
  query: string,
  page = 1,
  opts?: { fetchImpl?: typeof fetch; delayMs?: number },
): Promise<ScryfallSearchPage> {
  const q = String(query || '').trim();
  if (!q) {
    throw new Error('Enter a Scryfall search query.');
  }
  const fetchImpl = opts?.fetchImpl || fetch;
  if (page > 1) {
    await sleep(opts?.delayMs ?? PAGE_DELAY_MS);
  }
  const res = await fetchImpl(buildSearchUrl(q, page), {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw await parseError(res, 'No cards matched that search.');
  }
  const json = (await res.json()) as {
    data?: unknown[];
    has_more?: boolean;
    next_page?: string | null;
    total_cards?: number;
  };
  const data = (json.data || [])
    .map(asScryfallCard)
    .filter((c): c is ScryfallCard => Boolean(c));
  return {
    data,
    has_more: Boolean(json.has_more),
    next_page: json.next_page || null,
    total_cards: json.total_cards,
  };
}

export async function searchCardsNextPage(
  nextPageUrl: string,
  opts?: { fetchImpl?: typeof fetch; delayMs?: number },
): Promise<ScryfallSearchPage> {
  const fetchImpl = opts?.fetchImpl || fetch;
  await sleep(opts?.delayMs ?? PAGE_DELAY_MS);
  const res = await fetchImpl(nextPageUrl, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw await parseError(res, 'Failed to load more results.');
  }
  const json = (await res.json()) as {
    data?: unknown[];
    has_more?: boolean;
    next_page?: string | null;
    total_cards?: number;
  };
  const data = (json.data || [])
    .map(asScryfallCard)
    .filter((c): c is ScryfallCard => Boolean(c));
  return {
    data,
    has_more: Boolean(json.has_more),
    next_page: json.next_page || null,
    total_cards: json.total_cards,
  };
}

export async function fetchPrintings(
  cardName: string,
  options?: {
    defaultScryfallId?: string | null;
    fetchImpl?: typeof fetch;
  },
): Promise<ScryfallCard[]> {
  const name = String(cardName || '').trim();
  const cacheKey = name.toLowerCase();
  if (printCache[cacheKey]) {
    return printCache[cacheKey];
  }
  const fetchImpl = options?.fetchImpl || fetch;
  const res = await fetchImpl(buildPrintingsSearchUrl(name), {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    if (options?.defaultScryfallId) {
      const single = await fetchImpl(`${SCYFALL_API}/cards/${options.defaultScryfallId}`, {
        headers: { Accept: 'application/json' },
      });
      if (single.ok) {
        const one = asScryfallCard(await single.json());
        if (one) {
          printCache[cacheKey] = [one];
          return printCache[cacheKey];
        }
      }
    }
    throw await parseError(res, `Scryfall lookup failed for ${name}`);
  }
  const json = (await res.json()) as { data?: unknown[] };
  const prints = (json.data || [])
    .map(asScryfallCard)
    .filter((c): c is ScryfallCard => Boolean(c));
  printCache[cacheKey] = prints;
  return prints;
}

/** Apply printing fields onto an existing instance (identity preserved). */
export function applyPrintingToCard(
  card: CardInstance,
  printing: PrintingFields,
): CardInstance {
  return {
    ...card,
    name: printing.name || card.name,
    scryfallId: printing.scryfallId,
    setCode: printing.setCode || null,
    collectorNumber: printing.collectorNumber || null,
    typeLine: printing.typeLine,
    colourIdentity: printing.colourIdentity.length
      ? printing.colourIdentity
      : card.colourIdentity,
    layout: printing.layout ?? card.layout ?? null,
    foil: printing.foil,
  };
}
