import type { DeckDocument } from '../schemas/deck-builder.js';
import { resolveDeckCards } from './card-oracle.js';
import { collectCommandZoneCards } from './partner.js';
import { isCommandZoneFormat } from './format.js';

const WUBRG = ['W', 'U', 'B', 'R', 'G'] as const;

/** Resolved command-zone colour identity for search + in-deck legality UI. */
export type CommanderColourIdentity = {
  /** False when format isn't command-zone, no commanders, or not yet enriched. */
  known: boolean;
  /** WUBRG-ordered letters; empty when known colourless. */
  letters: string[];
};

/**
 * Resolve commander colour identity for command-zone formats.
 * Unknown (not known) when there are no command-zone cards or they lack
 * enrichment — same signal as `commanderIdentityScryfallQuery` returning null.
 */
export function resolveCommanderColourIdentity(
  doc: Pick<DeckDocument, 'format' | 'cards' | 'oracle'>,
): CommanderColourIdentity {
  if (!isCommandZoneFormat(doc.format)) {
    return { known: false, letters: [] };
  }

  const commanders = collectCommandZoneCards(resolveDeckCards(doc), doc.format);
  if (!commanders.length) {
    return { known: false, letters: [] };
  }

  const set = new Set<string>();
  for (const cmd of commanders) {
    for (const c of cmd.colourIdentity || []) {
      const letter = String(c).toUpperCase();
      if ((WUBRG as readonly string[]).includes(letter)) set.add(letter);
    }
  }
  const letters = WUBRG.filter((c) => set.has(c)).map((c) => c);
  if (letters.length) {
    return { known: true, letters };
  }

  const enriched = commanders.some((c) => Boolean(c.scryfallId || c.typeLine));
  return enriched ? { known: true, letters: [] } : { known: false, letters: [] };
}

/**
 * Default Scryfall query clause from commander colour identity, or null when
 * format is not commander / no commanders / identity not yet known.
 */
export function commanderIdentityScryfallQuery(
  doc: Pick<DeckDocument, 'format' | 'cards' | 'oracle'>,
): string | null {
  const identity = resolveCommanderColourIdentity(doc);
  if (!identity.known) return null;
  if (identity.letters.length) {
    return `id:${identity.letters.join('').toLowerCase()}`;
  }
  return 'id:c';
}

/**
 * True when the card's colour identity is outside a known commander identity.
 * Empty card CI is always legal; unknown identity never flags.
 */
export function isCardOutsideCommanderColourIdentity(
  card: { colourIdentity?: readonly string[] | null },
  identity: CommanderColourIdentity | null | undefined,
): boolean {
  if (!identity?.known) return false;
  const allowed = new Set(identity.letters.map((c) => String(c).toUpperCase()));
  for (const c of card.colourIdentity || []) {
    const letter = String(c).toUpperCase();
    if (!(WUBRG as readonly string[]).includes(letter)) continue;
    if (!allowed.has(letter)) return true;
  }
  return false;
}
