import { z } from 'zod';

/** Runtime list shape used by Dailies UI / ItemDB fetch (resolved from official defs + overlays). */
export const DailiesWishlistSchema = z.object({
  id: z.string(),
  label: z.string(),
  listUrl: z.string(),
  slug: z.string(),
  user: z.string(),
  img: z.string().optional().default(''),
  enabled: z.boolean().optional().default(true),
});

/** Per-list user overlays — official URLs are fixed in code. */
export const DailiesTrackingListOverlaySchema = z.object({
  enabled: z.boolean().optional(),
  img: z.string().optional(),
});

export const DailiesSettingsPayloadSchema = z.object({
  mainPetName: z.string().optional(),
  mainPetSlug: z.string().optional(),
  faerieQuest: z.enum(['illusen', 'jhudora']).optional(),
  schools: z.record(z.boolean()).optional(),
  magmaPoolLocalTime: z.string().optional(),
  magmaPoolBufferMinutes: z.number().int().nonnegative().optional(),
  /** @deprecated Migrated into trackingLists; kept for read-side migration. */
  wishlists: z.array(DailiesWishlistSchema).optional(),
  trackingLists: z.record(DailiesTrackingListOverlaySchema).optional(),
  itemdbHidden: z.record(z.unknown()).optional(),
});

export type DailiesWishlist = z.infer<typeof DailiesWishlistSchema>;
export type DailiesTrackingListOverlay = z.infer<typeof DailiesTrackingListOverlaySchema>;
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
  trackingLists: {},
};

export type OfficialDailiesListDef = {
  id: string;
  label: string;
  slug: string;
  user: 'official';
  listUrl: string;
  defaultImg: string;
};

/** Fixed ItemDB official catalogs — the only trackable lists. */
export const OFFICIAL_DAILIES_LISTS: OfficialDailiesListDef[] = [
  {
    id: 'gourmet-food',
    label: 'Gourmet Food',
    slug: 'gourmet-food',
    user: 'official',
    listUrl: 'https://itemdb.com.br/lists/official/gourmet-food',
    defaultImg: 'https://images.neopets.com/items/food_acara_cone.gif',
  },
  {
    id: 'books-checklist',
    label: 'Books',
    slug: 'book-award',
    user: 'official',
    listUrl: 'https://itemdb.com.br/lists/official/book-award',
    defaultImg: 'https://images.neopets.com/items/boo_acy15vii_neotradbeg.gif',
  },
  {
    id: 'booktastic-checklist',
    label: 'Booktastic',
    slug: 'booktastic-book-award',
    user: 'official',
    listUrl: 'https://itemdb.com.br/lists/official/booktastic-book-award',
    defaultImg: 'https://images.neopets.com/items/boo_stuck_in_space.gif',
  },
  {
    id: 'stamps-wishlist',
    label: 'Stamps',
    slug: 'all-collectibles',
    user: 'official',
    listUrl: 'https://itemdb.com.br/lists/official/all-collectibles',
    defaultImg: 'https://images.neopets.com/items/d3cf0h2ki5.gif',
  },
];

/** @deprecated Use OFFICIAL_DAILIES_LISTS + resolveOfficialWishlists */
export const DEFAULT_DAILIES_WISHLISTS: DailiesWishlist[] = OFFICIAL_DAILIES_LISTS.map((def) => ({
  id: def.id,
  label: def.label,
  listUrl: def.listUrl,
  slug: def.slug,
  user: def.user,
  img: def.defaultImg,
  enabled: true,
}));

const LEGACY_SLUG_TO_ID: Record<string, string> = {
  'gourmet-food-checklist': 'gourmet-food',
  'book-award-checklist-2': 'books-checklist',
  'book-award-checklist': 'books-checklist',
  'booktastic-book-award-checklist-2': 'booktastic-checklist',
  'booktastic-book-award-checklist': 'booktastic-checklist',
  'all-collectibles-checklist': 'stamps-wishlist',
};

export function officialListIdFromLegacy(
  entry: Partial<DailiesWishlist> | null | undefined,
): string | null {
  if (!entry) {
    return null;
  }
  if (entry.id && OFFICIAL_DAILIES_LISTS.some((d) => d.id === entry.id)) {
    return entry.id;
  }
  const slug = entry.slug || '';
  if (LEGACY_SLUG_TO_ID[slug]) {
    return LEGACY_SLUG_TO_ID[slug];
  }
  const official = OFFICIAL_DAILIES_LISTS.find((d) => d.slug === slug);
  return official ? official.id : null;
}

/**
 * Build trackingLists overlays from legacy wishlists[] and/or existing trackingLists.
 * Unknown custom lists are dropped.
 */
export function migrateTrackingLists(
  settings: DailiesSettingsPayload | null | undefined,
): Record<string, DailiesTrackingListOverlay> {
  const overlays: Record<string, DailiesTrackingListOverlay> = {
    ...(settings?.trackingLists || {}),
  };
  const legacy = settings?.wishlists;
  if (Array.isArray(legacy)) {
    const seenOfficialIds = new Set<string>();
    for (const entry of legacy) {
      const id = officialListIdFromLegacy(entry);
      if (!id) {
        continue;
      }
      seenOfficialIds.add(id);
      const prev = overlays[id] || {};
      overlays[id] = {
        enabled: prev.enabled !== undefined ? prev.enabled : entry.enabled !== false,
        img: prev.img || entry.img || undefined,
      };
    }
    // If legacy had an explicit curated set of official ids, disable missing ones
    if (legacy.length > 0 && seenOfficialIds.size > 0 && legacy.length <= OFFICIAL_DAILIES_LISTS.length) {
      const onlyOfficial = legacy.every((e) => officialListIdFromLegacy(e) != null);
      if (onlyOfficial && seenOfficialIds.size < OFFICIAL_DAILIES_LISTS.length) {
        for (const def of OFFICIAL_DAILIES_LISTS) {
          if (!seenOfficialIds.has(def.id) && overlays[def.id]?.enabled === undefined) {
            overlays[def.id] = { ...overlays[def.id], enabled: false };
          }
        }
      }
    }
  }
  return overlays;
}

/** Resolve official defs + overlays into runtime wishlist rows (all four; check enabled). */
export function resolveOfficialWishlists(
  settings: DailiesSettingsPayload | null | undefined,
): DailiesWishlist[] {
  const overlays = migrateTrackingLists(settings);
  return OFFICIAL_DAILIES_LISTS.map((def) => {
    const overlay = overlays[def.id] || {};
    return {
      id: def.id,
      label: def.label,
      listUrl: def.listUrl,
      slug: def.slug,
      user: def.user,
      img: (overlay.img && overlay.img.trim()) || def.defaultImg,
      enabled: overlay.enabled !== false,
    };
  });
}

export function enabledOfficialWishlists(
  settings: DailiesSettingsPayload | null | undefined,
): DailiesWishlist[] {
  return resolveOfficialWishlists(settings).filter((w) => w.enabled !== false);
}
