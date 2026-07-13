import { z } from 'zod';

export const DailiesWishlistSchema = z.object({
  id: z.string(),
  label: z.string(),
  listUrl: z.string(),
  slug: z.string(),
  user: z.string(),
  img: z.string().optional().default(''),
});

export const DailiesSettingsPayloadSchema = z.object({
  faerieQuest: z.enum(['illusen', 'jhudora']).optional(),
  schools: z.record(z.boolean()).optional(),
  magmaPoolLocalTime: z.string().optional(),
  magmaPoolBufferMinutes: z.number().int().nonnegative().optional(),
  wishlists: z.array(DailiesWishlistSchema).optional(),
  itemdbHidden: z.record(z.unknown()).optional(),
});

export type DailiesWishlist = z.infer<typeof DailiesWishlistSchema>;
export type DailiesSettingsPayload = z.infer<typeof DailiesSettingsPayloadSchema>;

export const DEFAULT_DAILIES_SCHOOLS: Record<string, boolean> = {
  swashbuckling: true,
  'mystery-island': true,
  'secret-ninja': true,
  'lab-ray': true,
  'kitchen-quests': true,
  'healing-springs': true,
  battledome: true,
  'faerie-quests': true,
};

export const DEFAULT_DAILIES_SETTINGS: DailiesSettingsPayload = {
  faerieQuest: 'illusen',
  schools: { ...DEFAULT_DAILIES_SCHOOLS },
  magmaPoolLocalTime: '14:47',
  magmaPoolBufferMinutes: 15,
};
