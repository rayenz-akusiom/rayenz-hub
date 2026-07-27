/**
 * Hub-side progress sync for single-page lists (Gourmet / Books / Booktastic).
 * Stamp Album is on-page Sync only — never fetched here.
 */

import type { DailiesWishlist } from '@rayenz-hub/shared';
import { neopetsFetch } from '../lib/neopets-bridge';
import { getMainPet } from './settings';
import {
  getAcquired,
  acquiredIidSet,
  markAcquired,
  recordListSync,
  type AcquisitionSource,
} from './acquisition-store';
import {
  matchObservations,
  observationsFromBooksReadHtml,
  observationsFromHtmlImages,
  type CatalogMatchItem,
  type ProgressObservation,
} from './progress-match';
import { loadListCache, syncAcquiredMemory, type WishlistItem } from './itemdb';

export const HUB_SYNCABLE_LIST_IDS = ['gourmet-food', 'books-checklist', 'booktastic-checklist'] as const;

export type HubSyncListId = (typeof HUB_SYNCABLE_LIST_IDS)[number];

export function isHubSyncableListId(listId: string): listId is HubSyncListId {
  return (HUB_SYNCABLE_LIST_IDS as readonly string[]).includes(listId);
}

export function progressUrlForList(listId: string, petName: string): string | null {
  const pet = encodeURIComponent(petName);
  switch (listId) {
    case 'gourmet-food':
      return `https://www.neopets.com/gourmet_club.phtml?pet_name=${pet}`;
    case 'books-checklist':
      return `https://www.neopets.com/books_read.phtml?pet_name=${pet}`;
    case 'booktastic-checklist':
      return `https://www.neopets.com/moon/books_read.phtml?pet_name=${pet}`;
    default:
      return null;
  }
}

function catalogItemsFromCache(list: DailiesWishlist): CatalogMatchItem[] {
  const cache = loadListCache(list);
  if (!cache?.items) {
    return [];
  }
  return cache.items.map((item: WishlistItem) => ({
    itemIid: item.itemIid,
    name: item.name,
    image: item.image,
    description: item.description,
  }));
}

function observationsForList(listId: string, html: string): ProgressObservation[] {
  if (listId === 'books-checklist') {
    return observationsFromBooksReadHtml(html);
  }
  // Gourmet + Booktastic: image-first pages
  return observationsFromHtmlImages(html);
}

export type SyncListResult = {
  listId: string;
  ok: boolean;
  matched: number;
  unmatched: number;
  catalogCount: number;
  acquiredCount: number;
  remainingCount: number;
  error?: string;
};

export function formatSyncResultSummary(result: SyncListResult, label?: string): string {
  const name = label || result.listId;
  if (!result.ok) {
    return name + ': ' + (result.error || 'sync failed');
  }
  return (
    name +
    ': acquired ' +
    result.acquiredCount +
    ' / catalog ' +
    result.catalogCount +
    ' · remaining ' +
    result.remainingCount +
    ' · unmatched ' +
    result.unmatched
  );
}

/**
 * Sync one Hub-allowed list from Neopets via bridge. Never used for stamps.
 */
export async function syncProgressForList(
  list: DailiesWishlist,
  options?: { petName?: string; html?: string },
): Promise<SyncListResult> {
  const listId = list.id;
  const empty = {
    listId,
    matched: 0,
    unmatched: 0,
    catalogCount: 0,
    acquiredCount: 0,
    remainingCount: 0,
  };
  if (!isHubSyncableListId(listId)) {
    return {
      ...empty,
      ok: false,
      error: 'Stamp Album sync is on-page only — open stamps.phtml and use Sync.',
    };
  }

  const petName = options?.petName || getMainPet();
  if (!petName && !options?.html) {
    return { ...empty, ok: false, error: 'Main pet required for progress sync.' };
  }

  let html = options?.html || '';
  if (!html) {
    const url = progressUrlForList(listId, petName);
    if (!url) {
      return { ...empty, ok: false, error: 'No progress URL for list.' };
    }
    try {
      const resp = await neopetsFetch(url);
      html = typeof resp === 'string' ? resp : resp.text || '';
    } catch (err) {
      return {
        ...empty,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  const catalog = catalogItemsFromCache(list);
  if (!catalog.length) {
    return {
      ...empty,
      ok: false,
      error: 'Catalog not loaded yet — wait for ItemDB cache, then sync again.',
    };
  }

  const observations = observationsForList(listId, html);
  const preferImage = listId === 'gourmet-food' || listId === 'booktastic-checklist';
  const { matchedIids, unmatched } = matchObservations(observations, catalog, { preferImage });

  const source: AcquisitionSource = 'progress';
  if (matchedIids.length) {
    await markAcquired(listId, matchedIids, source);
    syncAcquiredMemory(listId, matchedIids);
  }

  const acquiredDoc = await getAcquired(listId);
  const acquiredCount = acquiredIidSet(acquiredDoc).size;
  const catalogCount = catalog.length;
  const remainingCount = Math.max(0, catalogCount - acquiredCount);

  await recordListSync(listId, {
    unmatched: unmatched.length,
    acquiredCount,
    catalogCount,
    remainingCount,
  });

  return {
    listId,
    ok: true,
    matched: matchedIids.length,
    unmatched: unmatched.length,
    catalogCount,
    acquiredCount,
    remainingCount,
  };
}

/**
 * Apply acquired iids from an on-page stamp Sync (DOM already parsed).
 * Hub merges GM deltas via this path too.
 */
export async function applyStampPageMatches(
  listId: string,
  matchedIids: number[],
  stampPageKey?: string,
  unmatchedCount = 0,
): Promise<void> {
  if (matchedIids.length) {
    await markAcquired(listId, matchedIids, 'stamp-sync');
    syncAcquiredMemory(listId, matchedIids);
  }
  const catalog = loadListCache({ id: listId } as DailiesWishlist);
  const catalogCount = catalog?.items?.length || 0;
  const acquiredDoc = await getAcquired(listId);
  const acquiredCount = acquiredIidSet(acquiredDoc).size;
  await recordListSync(listId, {
    unmatched: unmatchedCount,
    stampPageKey,
    acquiredCount,
    catalogCount,
    remainingCount: Math.max(0, catalogCount - acquiredCount),
  });
}

export async function syncAllHubProgressLists(
  lists: DailiesWishlist[],
  options?: { petName?: string },
): Promise<SyncListResult[]> {
  const results: SyncListResult[] = [];
  for (const list of lists) {
    if (!isHubSyncableListId(list.id)) {
      continue;
    }
    results.push(await syncProgressForList(list, options));
  }
  return results;
}
