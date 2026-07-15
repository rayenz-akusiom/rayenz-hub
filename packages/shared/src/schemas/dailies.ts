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
  mainPetName: z.string().optional(),
  mainPetSlug: z.string().optional(),
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

/** Defaults with no main pet — unset until the user chooses one. */
export const DEFAULT_DAILIES_SETTINGS: DailiesSettingsPayload = {
  faerieQuest: 'illusen',
  schools: { ...DEFAULT_DAILIES_SCHOOLS },
  magmaPoolLocalTime: '14:47',
  magmaPoolBufferMinutes: 15,
};

export const DEFAULT_DAILIES_WISHLISTS: DailiesWishlist[] = [
  {
    id: 'stamps-wishlist',
    label: 'Stamps Wishlist',
    listUrl: 'https://itemdb.com.br/lists/rayenz/all-collectibles-checklist',
    slug: 'all-collectibles-checklist',
    user: 'rayenz',
    img: 'https://images.neopets.com/items/d3cf0h2ki5.gif',
  },
  {
    id: 'gourmet-food',
    label: 'Gourmet Food',
    listUrl: 'https://itemdb.com.br/lists/rayenz/gourmet-food-checklist',
    slug: 'gourmet-food-checklist',
    user: 'rayenz',
    img: 'https://images.neopets.com/items/food_acara_cone.gif',
  },
  {
    id: 'books-checklist',
    label: 'Books',
    listUrl: 'https://itemdb.com.br/lists/rayenz/book-award-checklist-2',
    slug: 'book-award-checklist-2',
    user: 'rayenz',
    img: 'https://images.neopets.com/items/boo_acy15vii_neotradbeg.gif',
  },
  {
    id: 'booktastic-checklist',
    label: 'Booktastic',
    listUrl: 'https://itemdb.com.br/lists/rayenz/booktastic-book-award-checklist-2',
    slug: 'booktastic-book-award-checklist-2',
    user: 'rayenz',
    img: 'https://images.neopets.com/items/boo_stuck_in_space.gif',
  },
];
