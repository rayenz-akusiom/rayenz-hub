import type { CategoryDef, DeckDocument, DeckFormat } from '../schemas/deck-builder.js';
import { PENDRAGON_ARTHUR, PENDRAGON_EXCALIBUR } from './partner.js';

export const PENDRAGON_ARTHUR_QUERY = 't:creature r:c legal:commander';
export const PENDRAGON_EXCALIBUR_QUERY = 'legal:commander (t:legendary t:equipment)';
export const PENDRAGON_NINETY_EIGHT_QUERY = 'r:c legal:commander';

export type PendragonRole = 'arthur' | 'excalibur' | 'ninety_eight';

export function defaultPendragonCategoryDefs(): CategoryDef[] {
  return [
    { name: PENDRAGON_ARTHUR, includedInDeck: true, includedInPrice: true, target: null },
    { name: PENDRAGON_EXCALIBUR, includedInDeck: true, includedInPrice: true, target: null },
    { name: 'Maybeboard', includedInDeck: false, includedInPrice: false, target: null },
  ];
}

export function pendragonRoleForCategory(category: string | null | undefined): PendragonRole {
  if (category === PENDRAGON_ARTHUR) return 'arthur';
  if (category === PENDRAGON_EXCALIBUR) return 'excalibur';
  return 'ninety_eight';
}

export function pendragonScryfallQuery(role: PendragonRole): string {
  if (role === 'arthur') return PENDRAGON_ARTHUR_QUERY;
  if (role === 'excalibur') return PENDRAGON_EXCALIBUR_QUERY;
  return PENDRAGON_NINETY_EIGHT_QUERY;
}

/** Include-Format clause for commander-family search (not the freeform box). */
export function formatScryfallClause(
  format: DeckFormat | string | null | undefined,
  role?: PendragonRole,
): string | null {
  if (format === 'commander') return 'format:commander';
  if (format === 'pendragon') return pendragonScryfallQuery(role || 'ninety_eight');
  return null;
}

function typeLineFaces(typeLine: string | null | undefined): string[] {
  const raw = String(typeLine || '').trim();
  if (!raw) return [];
  return raw.split(/\s+\/\/\s+/).map((f) => f.trim()).filter(Boolean);
}

function faceIsLand(face: string): boolean {
  return /\bLand\b/i.test(face);
}

function faceIsCreature(face: string): boolean {
  return /\bCreature\b/i.test(face);
}

function faceIsLegendaryEquipment(face: string): boolean {
  if (faceIsLand(face)) return false;
  return /\bLegendary\b/i.test(face) && /\bEquipment\b/i.test(face);
}

/** Arthur: any face is a creature. Commons are oracle-level (`hasCommonPrinting` / search `r:c`). */
export function isPendragonArthurType(typeLine: string | null | undefined): boolean {
  return typeLineFaces(typeLine).some(faceIsCreature);
}

/**
 * Excalibur: a castable (non-land) face is Legendary Equipment.
 * Covers normal equipment, reconfigure creatures, and MDFCs with an equipment face.
 */
export function isPendragonExcaliburType(typeLine: string | null | undefined): boolean {
  return typeLineFaces(typeLine).some(faceIsLegendaryEquipment);
}

export function hasCommonPrintingFlag(
  hasCommonPrinting: boolean | null | undefined,
): boolean | null {
  if (hasCommonPrinting === true) return true;
  if (hasCommonPrinting === false) return false;
  return null;
}

/**
 * Commons gate is oracle-level. Unknown (`null`) does not fail — search `r:c` is the source of truth.
 * Never use the selected printing’s rarity.
 */
export function isPendragonCommonLegal(hasCommonPrinting: boolean | null | undefined): boolean {
  return hasCommonPrinting !== false;
}

export function isPendragonArthurLegal(opts: {
  typeLine?: string | null;
  hasCommonPrinting?: boolean | null;
}): boolean {
  return isPendragonArthurType(opts.typeLine) && isPendragonCommonLegal(opts.hasCommonPrinting);
}

export function isPendragonExcaliburLegal(opts: { typeLine?: string | null }): boolean {
  return isPendragonExcaliburType(opts.typeLine);
}

export function isPendragonNinetyEightLegal(opts: {
  hasCommonPrinting?: boolean | null;
}): boolean {
  return isPendragonCommonLegal(opts.hasCommonPrinting);
}

export function isPendragonAddLegal(
  category: string,
  opts: { typeLine?: string | null; hasCommonPrinting?: boolean | null },
): boolean {
  const role = pendragonRoleForCategory(category);
  if (role === 'arthur') return isPendragonArthurLegal(opts);
  if (role === 'excalibur') return isPendragonExcaliburLegal(opts);
  return isPendragonNinetyEightLegal(opts);
}

export function remapPendragonImportCategory(name: string, format: DeckFormat): string {
  if (format !== 'pendragon') return name;
  if (name === 'Commander') return PENDRAGON_ARTHUR;
  return name;
}

export function remapCommanderImportCategory(name: string, format: DeckFormat): string {
  if (format !== 'commander') return name;
  if (name === PENDRAGON_ARTHUR) return 'Commander';
  if (name === PENDRAGON_EXCALIBUR) return 'Lieutenants';
  return name;
}

export function isPendragonDeckDocument(
  deck: Pick<DeckDocument, 'format'> | null | undefined,
): boolean {
  return deck?.format === 'pendragon';
}

export function remapPendragonDocumentHeaders(doc: DeckDocument): DeckDocument {
  if (doc.format !== 'pendragon') return doc;
  return {
    ...doc,
    cards: (doc.cards || []).map((c) => ({
      ...c,
      primaryCategory: remapPendragonImportCategory(c.primaryCategory, 'pendragon'),
      categories: (c.categories || []).map((n) => remapPendragonImportCategory(n, 'pendragon')),
    })),
    categories: (doc.categories || []).map((c) => ({
      ...c,
      name: remapPendragonImportCategory(c.name, 'pendragon'),
    })),
  };
}
