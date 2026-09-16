import type { DeckFormat, DeckSummary } from '../schemas/deck-builder.js';

const FORMAT_ORDER: DeckFormat[] = ['commander', 'pendragon', 'cube', 'collection', 'other'];

/**
 * Cap a public library to the most recently updated decks per format
 * (same “Recent” meaning as the Hub library: `updatedAt` desc).
 */
export function previewDecksPerFormat(
  decks: DeckSummary[],
  limitPerFormat: number,
): DeckSummary[] {
  const lim = Math.max(0, Math.floor(limitPerFormat));
  if (!lim) return [];

  const groups = new Map<DeckFormat, DeckSummary[]>();
  for (const format of FORMAT_ORDER) groups.set(format, []);

  for (const d of decks) {
    const format = (FORMAT_ORDER.includes(d.format) ? d.format : 'other') as DeckFormat;
    const list = groups.get(format) ?? [];
    list.push(d);
    groups.set(format, list);
  }

  const out: DeckSummary[] = [];
  for (const format of FORMAT_ORDER) {
    const list = groups.get(format) ?? [];
    if (!list.length) continue;
    list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.name.localeCompare(b.name));
    out.push(...list.slice(0, lim));
  }
  return out;
}
