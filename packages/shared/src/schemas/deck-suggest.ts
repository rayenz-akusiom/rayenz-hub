import { z } from 'zod';

export const DeckSuggestSettingsPayloadSchema = z.object({
  folderUrl: z.string().optional(),
  setCodes: z.string().optional(),
  deckLoadTab: z.enum(['folder', 'paste-import', 'paste-urls', 'upload']).nullable().optional(),
  customDeckUrls: z.string().optional(),
  pasteDeckImport: z.string().optional(),
  pasteDeckName: z.string().optional(),
  pasteDeckUrl: z.string().optional(),
  rulesDebug: z.boolean().optional(),
});

export type DeckSuggestSettingsPayload = z.infer<typeof DeckSuggestSettingsPayloadSchema>;

/** Neutral defaults — no personal Archidekt URLs. */
export const DEFAULT_DECK_SUGGEST_SETTINGS: DeckSuggestSettingsPayload = {
  folderUrl: '',
  setCodes: '',
  deckLoadTab: null,
  customDeckUrls: '',
  pasteDeckImport: '',
  pasteDeckName: '',
  pasteDeckUrl: '',
  rulesDebug: false,
};
