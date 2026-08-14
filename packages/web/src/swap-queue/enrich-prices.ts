import type { WantSource } from '@rayenz-hub/shared';

type ScryfallCard = {
  name?: string;
  set?: string;
  collector_number?: string;
  prices?: { usd?: string | null; usd_foil?: string | null };
};

type CollectionIdentifier =
  | { name: string }
  | { set: string; collector_number: string };

function parseUsd(raw: string | null | undefined): number | null {
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function printingKey(set: string, collector: string): string {
  return `${set.toLowerCase()}|${collector.toLowerCase()}`;
}

function sourcePrintingKey(s: WantSource): string | null {
  const set = s.setCode?.trim();
  const collector = s.collectorNumber?.trim();
  if (!set || !collector) return null;
  return printingKey(set, collector);
}

function identifierFor(s: WantSource): CollectionIdentifier {
  const set = s.setCode?.trim();
  const collector = s.collectorNumber?.trim();
  if (set && collector) {
    return { set: set.toLowerCase(), collector_number: collector };
  }
  return { name: s.cardName };
}

function priceFromCard(card: ScryfallCard, foil: boolean): number | null {
  if (foil) {
    return parseUsd(card.prices?.usd_foil) ?? parseUsd(card.prices?.usd);
  }
  return parseUsd(card.prices?.usd);
}

/**
 * Opportunistic Scryfall USD enrichment for want sources (non-blocking).
 * Prefers set + collector_number when known; uses usd_foil for foil copies.
 * Missing/failed prices stay null so the price filter still includes them.
 */
export async function enrichWantSourcesUsd(sources: WantSource[]): Promise<WantSource[]> {
  const need = sources.filter((s) => s.usd == null);
  if (!need.length) return sources;

  const seen = new Set<string>();
  const identifiers: CollectionIdentifier[] = [];
  for (const s of need) {
    const id = identifierFor(s);
    const key =
      'set' in id
        ? `set:${printingKey(id.set, id.collector_number)}`
        : `name:${id.name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    identifiers.push(id);
  }
  if (!identifiers.length) return sources;

  const priceByPrinting = new Map<string, number>();
  const priceByName = new Map<string, number>();
  const chunkSize = 75;
  for (let i = 0; i < identifiers.length; i += chunkSize) {
    const chunk = identifiers.slice(i, i + chunkSize);
    try {
      const res = await fetch('https://api.scryfall.com/cards/collection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifiers: chunk }),
      });
      if (!res.ok) continue;
      const body = (await res.json()) as { data?: ScryfallCard[] };
      for (const card of body.data || []) {
        const set = String(card.set || '').trim();
        const collector = String(card.collector_number || '').trim();
        const name = String(card.name || '').trim();
        const nonfoil = parseUsd(card.prices?.usd);
        const foil = parseUsd(card.prices?.usd_foil);
        if (set && collector) {
          const key = printingKey(set, collector);
          // Store nonfoil as default; foil lookups prefer usd_foil below via priceFromCard path.
          if (nonfoil != null) priceByPrinting.set(`${key}|nf`, nonfoil);
          if (foil != null) priceByPrinting.set(`${key}|f`, foil);
          else if (nonfoil != null) priceByPrinting.set(`${key}|f`, nonfoil);
        }
        if (name && nonfoil != null) {
          priceByName.set(name.toLowerCase(), nonfoil);
        }
      }
    } catch {
      /* leave unpriced */
    }
  }

  if (!priceByPrinting.size && !priceByName.size) return sources;

  return sources.map((s) => {
    if (s.usd != null) return s;
    const pk = sourcePrintingKey(s);
    if (pk) {
      const fromPrint = priceByPrinting.get(`${pk}|${s.foil ? 'f' : 'nf'}`);
      if (fromPrint != null) return { ...s, usd: fromPrint };
    }
    const fromName = priceByName.get(s.cardName.toLowerCase()) ?? priceByName.get(s.mergeKey);
    return fromName != null ? { ...s, usd: fromName } : s;
  });
}

/** Exposed for unit tests — pick usd vs usd_foil. */
export function pickScryfallUsd(card: ScryfallCard, foil: boolean): number | null {
  return priceFromCard(card, foil);
}
