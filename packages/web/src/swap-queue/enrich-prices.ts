import type { WantSource } from '@rayenz-hub/shared';

type ScryfallCard = {
  name?: string;
  prices?: { usd?: string | null };
};

/**
 * Opportunistic Scryfall USD enrichment for want sources (non-blocking).
 * Missing/failed prices stay null so the price filter still includes them.
 */
export async function enrichWantSourcesUsd(sources: WantSource[]): Promise<WantSource[]> {
  const need = sources.filter((s) => s.usd == null);
  if (!need.length) return sources;

  const names = [...new Set(need.map((s) => s.cardName).filter(Boolean))];
  if (!names.length) return sources;

  const priceByName = new Map<string, number>();
  const chunkSize = 75;
  for (let i = 0; i < names.length; i += chunkSize) {
    const chunk = names.slice(i, i + chunkSize);
    try {
      const res = await fetch('https://api.scryfall.com/cards/collection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifiers: chunk.map((name) => ({ name })),
        }),
      });
      if (!res.ok) continue;
      const body = (await res.json()) as { data?: ScryfallCard[] };
      for (const card of body.data || []) {
        const name = String(card.name || '').trim();
        const raw = card.prices?.usd;
        const usd = raw != null && raw !== '' ? Number(raw) : NaN;
        if (name && Number.isFinite(usd)) {
          priceByName.set(name.toLowerCase(), usd);
        }
      }
    } catch {
      /* leave unpriced */
    }
  }

  if (!priceByName.size) return sources;

  return sources.map((s) => {
    if (s.usd != null) return s;
    const usd = priceByName.get(s.cardName.toLowerCase()) ?? priceByName.get(s.mergeKey);
    return usd != null ? { ...s, usd } : s;
  });
}
