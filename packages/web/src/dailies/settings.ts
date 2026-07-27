import {
  DEFAULT_DAILIES_WISHLISTS,
  enabledOfficialWishlists,
  migrateTrackingLists,
  resolveOfficialWishlists,
  type DailiesSettingsPayload,
  type DailiesTrackingListOverlay,
  type DailiesWishlist,
} from '@rayenz-hub/shared';
import { getHubStorage } from '../lib/hub-storage';
import type { DailyLink } from './links';

export const MAIN_PET_KEY = 'rayenz-main-pet';
export const MAIN_PET_SLUG_KEY = 'rayenz-main-pet-slug';

export { DEFAULT_DAILIES_WISHLISTS as DEFAULT_WISHLISTS };
export { resolveOfficialWishlists, enabledOfficialWishlists, migrateTrackingLists };

export const SCHOOL_LABELS: Record<string, string> = {
  swashbuckling: 'Swashbuckling Academy',
  'mystery-island': 'Mystery Island Training',
  'secret-ninja': 'Secret Ninja Training',
  'lab-ray': 'Lab Ray',
  'kitchen-quests': 'Kitchen Quests',
  'healing-springs': 'Healing Springs',
  battledome: 'Battledome',
  'faerie-quests': 'Faerie Quests',
};

export function parseItemDbListUrl(url: string): { user: string; slug: string } | null {
  if (!url) {
    return null;
  }
  const match = String(url)
    .trim()
    .match(/itemdb\.com\.br\/lists\/([^/?#]+)\/([^/?#]+)/i);
  if (!match) {
    return null;
  }
  return {
    user: decodeURIComponent(match[1]),
    slug: decodeURIComponent(match[2]),
  };
}

/** @deprecated Official lists are fixed; prefer resolveOfficialWishlists. */
export function normalizeWishlist(
  entry: Partial<DailiesWishlist> | null | undefined,
  index = 0,
): DailiesWishlist {
  const e = entry || {};
  const parsed = parseItemDbListUrl(e.listUrl || '');
  const slug = e.slug || (parsed && parsed.slug) || '';
  const user = e.user || (parsed && parsed.user) || 'official';
  const listUrl =
    e.listUrl ||
    (slug
      ? 'https://itemdb.com.br/lists/' + encodeURIComponent(user) + '/' + encodeURIComponent(slug)
      : '');
  return {
    id: e.id || slug || 'wishlist-' + index,
    label: String(e.label || slug || 'Wishlist').trim(),
    listUrl,
    slug,
    user,
    img: e.img || '',
    enabled: e.enabled !== false,
  };
}

export function normalizeWishlistsForSave(wishlists: unknown): DailiesWishlist[] {
  if (!Array.isArray(wishlists)) {
    return [];
  }
  return wishlists.map((entry, index) => normalizeWishlist(entry as Partial<DailiesWishlist>, index));
}

/** Enabled official lists for Dailies cards / ItemDB fetch. */
export function getWishlists(
  settings: DailiesSettingsPayload | Record<string, never> | null | undefined,
): DailiesWishlist[] {
  return enabledOfficialWishlists(settings as DailiesSettingsPayload | null | undefined);
}

/** All four official lists with overlays (for settings UI). */
export function getAllTrackingLists(
  settings: DailiesSettingsPayload | Record<string, never> | null | undefined,
): DailiesWishlist[] {
  return resolveOfficialWishlists(settings as DailiesSettingsPayload | null | undefined);
}

export function stripSettingsForPersist(
  settings: DailiesSettingsPayload,
): DailiesSettingsPayload {
  const trackingLists = migrateTrackingLists(settings);
  const { wishlists: _drop, ...rest } = settings;
  return {
    ...rest,
    trackingLists,
  };
}

export function updateTrackingOverlay(
  settings: DailiesSettingsPayload,
  listId: string,
  patch: Partial<DailiesTrackingListOverlay>,
): DailiesSettingsPayload {
  const trackingLists = { ...migrateTrackingLists(settings) };
  trackingLists[listId] = { ...trackingLists[listId], ...patch };
  return { ...settings, trackingLists, wishlists: undefined };
}

export function loadSettings(): DailiesSettingsPayload | Record<string, never> {
  const storage = getHubStorage() || (window as Window & { HubStorage?: ReturnType<typeof getHubStorage> }).HubStorage;
  return storage ? (storage.loadDailiesSettings() as DailiesSettingsPayload) : {};
}

export function saveSettings(
  settings: DailiesSettingsPayload | Record<string, unknown> | null | undefined,
): void {
  const storage = getHubStorage() || (window as Window & { HubStorage?: ReturnType<typeof getHubStorage> }).HubStorage;
  if (storage && settings) {
    const payload = stripSettingsForPersist(settings as DailiesSettingsPayload);
    storage.saveDailiesSettings(payload);
  }
}

export function getMainPet(): string {
  try {
    return String(localStorage.getItem(MAIN_PET_KEY) || '').trim();
  } catch {
    return '';
  }
}

export function getMainPetSlug(): string {
  try {
    return String(localStorage.getItem(MAIN_PET_SLUG_KEY) || '').trim();
  } catch {
    return '';
  }
}

export function hasMainPet(): boolean {
  return !!getMainPet();
}

export function saveMainPet(petName: string, slug?: string | null): void {
  try {
    const name = String(petName || '').trim();
    if (!name) {
      localStorage.removeItem(MAIN_PET_KEY);
      localStorage.removeItem(MAIN_PET_SLUG_KEY);
      return;
    }
    localStorage.setItem(MAIN_PET_KEY, name);
    if (slug) {
      localStorage.setItem(MAIN_PET_SLUG_KEY, String(slug).trim());
    } else {
      localStorage.removeItem(MAIN_PET_SLUG_KEY);
    }
  } catch {
    /* ignore */
  }
}

export type ParsePetImageSlugOptions = {
  previousSlug?: string;
  nameChanged?: boolean;
};

/**
 * Extract a pet image slug from petlookup HTML.
 * Prefers the main /1/1.png portrait over the first /cp/ hit (often the active-pet chrome).
 * When the pet name changed, rejects a result that only matches the previous slug.
 */
export function parsePetImageSlug(html: string, options: ParsePetImageSlugOptions = {}): string | null {
  const previousSlug = options.previousSlug ? String(options.previousSlug).trim() : '';
  const nameChanged = !!options.nameChanged;
  const text = String(html || '');
  const mainMatch = text.match(/pets\.neopets\.com\/cp\/([a-z0-9]+)\/1\/1\.png/i);
  if (mainMatch) {
    const mainSlug = mainMatch[1];
    if (nameChanged && previousSlug && mainSlug === previousSlug) {
      return null;
    }
    return mainSlug;
  }
  const found: string[] = [];
  const re = /pets\.neopets\.com\/cp\/([a-z0-9]+)\//gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (!found.includes(match[1])) {
      found.push(match[1]);
    }
  }
  if (found.length === 0) {
    return null;
  }
  if (nameChanged && previousSlug) {
    for (const slug of found) {
      if (slug !== previousSlug) {
        return slug;
      }
    }
    return null;
  }
  return found[0];
}

export function isSchoolEnabled(
  settings: DailiesSettingsPayload | Record<string, never>,
  schoolId: string,
): boolean {
  if (!settings.schools) {
    return true;
  }
  if (settings.schools[schoolId] === undefined) {
    return true;
  }
  return !!settings.schools[schoolId];
}

export function shouldShowLink(
  link: DailyLink,
  settings: DailiesSettingsPayload | Record<string, never>,
): boolean {
  if (link.faerieQuest) {
    return settings.faerieQuest === link.faerieQuest;
  }
  if (link.school) {
    return isSchoolEnabled(settings, link.school);
  }
  return true;
}
