import { z } from 'zod';

export const SettingsUpsertSchema = z.object({
  formatVersion: z.number().int().positive().optional().default(1),
  payload: z.record(z.unknown()),
});

export const SettingsResponseSchema = z.object({
  domain: z.enum(['dailies', 'order-reconcile', 'deck-suggest', 'deck-builder']),
  formatVersion: z.number(),
  payload: z.record(z.unknown()),
  updatedAt: z.string(),
});

export type SettingsUpsert = z.infer<typeof SettingsUpsertSchema>;
export type SettingsResponse = z.infer<typeof SettingsResponseSchema>;
