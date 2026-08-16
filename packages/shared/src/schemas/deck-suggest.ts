import { z } from 'zod';

export const DeckSuggestSettingsPayloadSchema = z.object({
  setCodes: z.string().optional(),
  /** Catalog release id, e.g. group:ltr or block:zen */
  releaseId: z.string().optional(),
  setInputMode: z.enum(['release', 'codes']).optional(),
  rulesDebug: z.boolean().optional(),
  // Legacy fields kept optional so old API payloads still parse.
  productName: z.string().optional(),
  folderUrl: z.string().optional(),
  deckLoadTab: z.enum(['folder', 'paste-import', 'paste-urls', 'upload']).nullable().optional(),
  customDeckUrls: z.string().optional(),
  pasteDeckImport: z.string().optional(),
  pasteDeckName: z.string().optional(),
  pasteDeckUrl: z.string().optional(),
});

export type DeckSuggestSettingsPayload = z.infer<typeof DeckSuggestSettingsPayloadSchema>;

/** Neutral defaults — Scryfall group/block release is the primary picker. */
export const DEFAULT_DECK_SUGGEST_SETTINGS: DeckSuggestSettingsPayload = {
  setCodes: '',
  releaseId: '',
  setInputMode: 'release',
  rulesDebug: false,
};
