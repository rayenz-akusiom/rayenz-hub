import { z } from 'zod';
import {
  deckCoverImageUrl,
  deckCoverImageUrlSecondary,
  pickCoverPartnerStatus,
} from '../deck-builder/deck-cover.js';

export const DeckFormatSchema = z.enum(['commander', 'cube', 'other']);
export type DeckFormat = z.infer<typeof DeckFormatSchema>;

export const BrowseViewSchema = z.enum(['category', 'colour_identity', 'colour_identity_spells']);
export type BrowseView = z.infer<typeof BrowseViewSchema>;

export const CardLayoutSchema = z.enum(['stacked', 'grid']);
export type CardLayout = z.infer<typeof CardLayoutSchema>;

export const CategoryDefSchema = z.object({
  name: z.string().min(1),
  includedInDeck: z.boolean().default(true),
  includedInPrice: z.boolean().default(true),
});
export type CategoryDef = z.infer<typeof CategoryDefSchema>;

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
  colourIdentity: z.array(z.enum(['W', 'U', 'B', 'R', 'G'])).default([]),
  typeLine: z.string().nullable().default(null),
  /** Scryfall layout (e.g. transform, modal_dfc); used to detect dual-faced cards. */
  layout: z.string().nullable().default(null),
  /** Scryfall keywords; null until enriched (leaders need this for partner checks). */
  keywords: z.array(z.string()).nullable().default(null),
  /** Parsed "Partner with [Name]" target; null if none / not yet known. */
  partnerWith: z.string().nullable().default(null),
  archidektCardId: z.number().nullable().default(null),
  foil: z.boolean().default(false),
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

export const DeckDocumentSchema = z.object({
  schemaVersion: z.literal(1).or(z.number().int().positive()),
  deckId: z.string().min(1),
  name: z.string().min(1),
  format: DeckFormatSchema,
  archidektId: z.number().nullable().default(null),
  archidektUrl: z.string().nullable().default(null),
  categories: z.array(CategoryDefSchema).default([]),
  cards: z.array(CardInstanceSchema).default([]),
  formalSwapEntries: z.array(FormalSwapEntrySchema).default([]),
  browseViewDefault: BrowseViewSchema.nullable().default(null),
  cardLayoutDefault: CardLayoutSchema.optional().default('stacked'),
  createdAt: z.string(),
  updatedAt: z.string(),
  lastArchidektSyncAt: z.string().nullable().default(null),
  lastArchidektImportAt: z.string().nullable().default(null),
});
export type DeckDocument = z.infer<typeof DeckDocumentSchema>;

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
});
export type DeckSummary = z.infer<typeof DeckSummarySchema>;

export function toDeckSummary(doc: DeckDocument): DeckSummary {
  return {
    deckId: doc.deckId,
    name: doc.name,
    format: doc.format,
    updatedAt: doc.updatedAt,
    archidektId: doc.archidektId ?? null,
    coverImageUrl: deckCoverImageUrl(doc),
    coverImageUrlSecondary: deckCoverImageUrlSecondary(doc),
    coverPartnerStatus: doc.format === 'commander' ? pickCoverPartnerStatus(doc) : null,
  };
}
