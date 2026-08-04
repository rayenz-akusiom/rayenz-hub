import type { DeckDocument } from '../schemas/deck-builder.js';
import { resolveDeckCards } from './card-oracle.js';
import { collectCommanders } from './partner.js';

const WUBRG = ['W', 'U', 'B', 'R', 'G'] as const;

/**
 * Default Scryfall query clause from commander colour identity, or null when
 * format is not commander / no commanders / identity not yet known.
 */
export function commanderIdentityScryfallQuery(
  doc: Pick<DeckDocument, 'format' | 'cards' | 'oracle'>,
): string | null {
  if (doc.format !== 'commander') return null;

  const commanders = collectCommanders(resolveDeckCards(doc));
  if (!commanders.length) return null;

  const set = new Set<string>();
  for (const cmd of commanders) {
    for (const c of cmd.colourIdentity || []) {
      const letter = String(c).toUpperCase();
      if ((WUBRG as readonly string[]).includes(letter)) set.add(letter);
    }
  }
  const ordered = WUBRG.filter((c) => set.has(c));
  if (ordered.length) {
    return `id:${ordered.join('').toLowerCase()}`;
  }

  const enriched = commanders.some((c) => Boolean(c.scryfallId || c.typeLine));
  return enriched ? 'id:c' : null;
}
