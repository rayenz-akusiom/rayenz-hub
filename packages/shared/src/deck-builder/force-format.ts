import type { DeckDocument } from '../schemas/deck-builder.js';
import { detectDeckFormat } from './format.js';

export type ForcedFormat = 'commander' | 'cube';

export function applyForcedFormat(
  doc: DeckDocument,
  forcedFormat: ForcedFormat,
): { document: DeckDocument; formatMismatchWarning: string | null } {
  const heuristic = detectDeckFormat({ name: doc.name, format: doc.format });
  const formatMismatchWarning =
    heuristic !== forcedFormat
      ? `This deck looks like a ${heuristic} deck, but will be saved as ${forcedFormat}.`
      : null;
  return {
    document: { ...doc, format: forcedFormat },
    formatMismatchWarning,
  };
}
