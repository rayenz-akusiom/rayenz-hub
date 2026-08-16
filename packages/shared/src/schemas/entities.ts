import { z } from 'zod';

export const ProfileUpsertSchema = z.object({
  deckName: z.string().optional(),
  formatVersion: z.number().int().positive().optional().default(1),
  protectedCards: z.array(z.string()).optional().default([]),
  blockedCards: z.array(z.string()).optional().default([]),
  tags: z.array(z.string()).optional().default([]),
  yaml: z.string().optional(),
});

export type ProfileUpsert = z.infer<typeof ProfileUpsertSchema>;

export const ReviewProgressUpsertSchema = z.object({
  formatVersion: z.number().int().positive().optional().default(1),
  decisions: z.record(z.enum(['accept', 'reject', 'skip'])),
  currentDeckId: z.string().nullable().optional(),
  currentSuggestionIndex: z.record(z.number()).optional(),
});

export type ReviewProgressUpsert = z.infer<typeof ReviewProgressUpsertSchema>;

/** Bump when Scryfall pool query / card shape changes so cached pools refetch. */
export const SET_POOL_FORMAT_VERSION = 2;

export const SetPoolUpsertSchema = z.object({
  codes: z.array(z.string()),
  complete: z.boolean(),
  primaryCode: z.string().optional(),
  setName: z.string().optional(),
  cards: z.array(z.record(z.unknown())).optional().default([]),
  formatVersion: z.number().int().positive().optional().default(SET_POOL_FORMAT_VERSION),
});

export type SetPoolUpsert = z.infer<typeof SetPoolUpsertSchema>;

export const INLINE_SET_POOL_MAX_BYTES = 350 * 1024;
