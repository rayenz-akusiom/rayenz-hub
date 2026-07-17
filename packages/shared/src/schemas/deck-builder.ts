import { z } from 'zod';
import { cardDisplayName, migrateDeckDocument } from '../deck-builder/card-oracle.js';
import {
  deckCoverImageUrl,
  deckCoverImageUrlSecondary,
  pickCoverPartnerStatus,
  pickDeckCoverCard,
} from '../deck-builder/deck-cover.js';

export const DeckFormatSchema = z.enum(['commander', 'cube', 'other']);
export type DeckFormat = z.infer<typeof DeckFormatSchema>;

export const BrowseViewSchema = z.enum(['category', 'colour_identity', 'colour_identity_spells']);
export type BrowseView = z.infer<typeof BrowseViewSchema>;

export const CardLayoutSchema = z.enum(['stacked', 'grid']);
export type CardLayout = z.infer<typeof CardLayoutSchema>;

/** Within-group card sort in browse (category / CI columns). */
export const CardSortModeSchema = z.enum([
  'name_asc',
  'name_desc',
  'colour_identity',
  'mana_asc',
  'mana_desc',
]);
export type CardSortMode = z.infer<typeof CardSortModeSchema>;

export const CategoryDefSchema = z.object({
  name: z.string().min(1),
  includedInDeck: z.boolean().default(true),
  includedInPrice: z.boolean().default(true),
});
export type CategoryDef = z.infer<typeof CategoryDefSchema>;

export const ColourLetterSchema = z.enum(['W', 'U', 'B', 'R', 'G']);

/** Enriched Scryfall fields keyed separately from the lean card list. */
export const CardOracleSchema = z.object({
  scryfallId: z.string().nullable().default(null),
  colourIdentity: z.array(ColourLetterSchema).default([]),
  typeLine: z.string().nullable().default(null),
  layout: z.string().nullable().default(null),
  keywords: z.array(z.string()).nullable().default(null),
  partnerWith: z.string().nullable().default(null),
  oracleText: z.string().nullable().default(null),
  /** Face name when it differs from oracle name (e.g. UB / localized). */
  printedName: z.string().nullable().default(null),
  /** Just-for-fun face name (e.g. Godzilla series). */
  flavorName: z.string().nullable().default(null),
  /** Scryfall CMC; null means not yet enriched. */
  manaValue: z.number().nullable().default(null),
  /** CDN URL (cards.scryfall.io) — never image bytes. */
  imageUrl: z.string().nullable().default(null),
  /** Scryfall finishes for this printing (e.g. nonfoil, foil); null = not enriched. */
  finishes: z.array(z.string()).nullable().default(null),
  updatedAt: z.string().nullable().default(null),
});
export type CardOracle = z.infer<typeof CardOracleSchema>;

/** Lean list identity — oracle fields live on DeckDocument.oracle. */
export const CardInstanceSchema = z.object({
  instanceId: z.string().min(1),
  name: z.string().min(1),
  quantity: z.number().positive().default(1),
  primaryCategory: z.string().min(1),
  categories: z.array(z.string()).default([]),
  stack: z.string().nullable().default(null),
  setCode: z.string().nullable().default(null),
  collectorNumber: z.string().nullable().default(null),
  scryfallId: z.string().nullable().default(null),
  archidektCardId: z.number().nullable().default(null),
  foil: z.boolean().default(false),
  /** Unofficial / proxy copy; Archidekt secondary category "Proxies". */
  proxy: z.boolean().default(false),
});
export type CardInstance = z.infer<typeof CardInstanceSchema>;

export const FormalSwapEntrySchema = z.object({
  id: z.string().min(1),
  inInstanceId: z.string().nullable().default(null),
  outInstanceId: z.string().nullable().default(null),
  inTargetCategory: z.string().nullable().default(null),
  sortIndex: z.number().int().nonnegative().default(0),
  notes: z.string().nullable().optional().default(null),
});
export type FormalSwapEntry = z.infer<typeof FormalSwapEntrySchema>;

const DeckDocumentObjectSchema = z.object({
  schemaVersion: z.literal(1).or(z.number().int().positive()),
  deckId: z.string().min(1),
  name: z.string().min(1),
  format: DeckFormatSchema,
  archidektId: z.number().nullable().default(null),
  archidektUrl: z.string().nullable().default(null),
  categories: z.array(CategoryDefSchema).default([]),
  cards: z.array(CardInstanceSchema).default([]),
  /** Print-keyed oracle cache (id: / print: / name:). */
  oracle: z.record(z.string(), CardOracleSchema).default({}),
  formalSwapEntries: z.array(FormalSwapEntrySchema).default([]),
  /** When set and present in cards, library cover uses this instance instead of the heuristic. */
  coverInstanceId: z.string().nullable().default(null),
  browseViewDefault: BrowseViewSchema.nullable().default(null),
  cardLayoutDefault: CardLayoutSchema.optional().default('stacked'),
  cardSortDefault: CardSortModeSchema.optional().default('name_asc'),
  createdAt: z.string(),
  updatedAt: z.string(),
  lastArchidektSyncAt: z.string().nullable().default(null),
  lastArchidektImportAt: z.string().nullable().default(null),
});

/** Parses deck docs; migrates legacy on-card enrich fields into `oracle`. */
export const DeckDocumentSchema = z.preprocess(
  (raw) => (raw && typeof raw === 'object' ? migrateDeckDocument(raw as Record<string, unknown>) : raw),
  DeckDocumentObjectSchema,
);
export type DeckDocument = z.infer<typeof DeckDocumentObjectSchema>;

export const DeckSummarySchema = z.object({
  deckId: z.string(),
  name: z.string(),
  format: DeckFormatSchema,
  updatedAt: z.string(),
  archidektId: z.number().nullable().default(null),
  /** Scryfall image URL for library cover (commander, or first card for cubes). */
  coverImageUrl: z.string().nullable().optional().default(null),
  /** Second commander face when the deck has exactly two leaders. */
  coverImageUrlSecondary: z.string().nullable().optional().default(null),
  /** Partner legality for dual-cover tiles: legal | illegal | null (single / N/A). */
  coverPartnerStatus: z.enum(['legal', 'illegal']).nullable().optional().default(null),
  /** Display name of the highlighted cover card (for library sort). */
  coverCardName: z.string().nullable().optional().default(null),
});
export type DeckSummary = z.infer<typeof DeckSummarySchema>;

export function toDeckSummary(doc: DeckDocument): DeckSummary {
  const coverCard = pickDeckCoverCard(doc);
  return {
    deckId: doc.deckId,
    name: doc.name,
    format: doc.format,
    updatedAt: doc.updatedAt,
    archidektId: doc.archidektId ?? null,
    coverImageUrl: deckCoverImageUrl(doc),
    coverImageUrlSecondary: deckCoverImageUrlSecondary(doc),
    coverPartnerStatus: doc.format === 'commander' ? pickCoverPartnerStatus(doc) : null,
    coverCardName: coverCard ? cardDisplayName(coverCard) : null,
  };
}
