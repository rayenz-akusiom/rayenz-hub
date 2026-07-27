/**
 * Compact needed-index for Tampermonkey GM mirror + Hub push/pull.
 */

import type { DailiesWishlist } from '@rayenz-hub/shared';
import { imageKeyFromUrl, normalizeItemName } from './progress-match';
import { getAcquiredIdsSync, loadListCache, type WishlistItem } from './itemdb';

export type NeededSnapshot = {
  version: 1;
  updatedAt: number;
  byName: string[];
  byImageKey: string[];
  /** name -> list ids that still need it */
  nameToLists: Record<string, string[]>;
  imageToLists: Record<string, string[]>;
  byList: Record<string, number[]>;
  /** Compact catalog for on-page matching (stamps Sync, etc.) */
  catalogLite: Record<
    string,
    Array<{ itemIid: number; name: string; imageKey: string | null; description: string | null }>
  >;
};

export type AcquisitionDelta = {
  listId: string;
  itemIids: number[];
  source: string;
  at: number;
};

declare global {
  interface Window {
    __pushNeededSnapshot?: (snapshot: NeededSnapshot) => void;
    __pullAcquisitionDeltas?: () => AcquisitionDelta[];
    __dailiesNeededReady?: boolean;
  }
}

export function buildNeededSnapshot(lists: DailiesWishlist[]): NeededSnapshot {
  const byName = new Set<string>();
  const byImageKey = new Set<string>();
  const nameToLists: Record<string, string[]> = {};
  const imageToLists: Record<string, string[]> = {};
  const byList: Record<string, number[]> = {};
  const catalogLite: NeededSnapshot['catalogLite'] = {};

  for (const list of lists) {
    const cache = loadListCache(list);
    if (!cache?.items?.length) {
      byList[list.id] = [];
      catalogLite[list.id] = [];
      continue;
    }
    const acquired = new Set(getAcquiredIdsSync(list.id));
    const neededIids: number[] = [];
    const lite: NeededSnapshot['catalogLite'][string] = [];
    for (const item of cache.items as WishlistItem[]) {
      const imgKey = imageKeyFromUrl(item.image);
      lite.push({
        itemIid: item.itemIid,
        name: item.name,
        imageKey: imgKey,
        description: item.description,
      });
      if (acquired.has(item.itemIid)) {
        continue;
      }
      neededIids.push(item.itemIid);
      const nameKey = normalizeItemName(item.name);
      if (nameKey) {
        byName.add(nameKey);
        if (!nameToLists[nameKey]) {
          nameToLists[nameKey] = [];
        }
        if (!nameToLists[nameKey].includes(list.id)) {
          nameToLists[nameKey].push(list.id);
        }
      }
      if (imgKey) {
        byImageKey.add(imgKey);
        if (!imageToLists[imgKey]) {
          imageToLists[imgKey] = [];
        }
        if (!imageToLists[imgKey].includes(list.id)) {
          imageToLists[imgKey].push(list.id);
        }
      }
    }
    byList[list.id] = neededIids;
    catalogLite[list.id] = lite;
  }

  return {
    version: 1,
    updatedAt: Date.now(),
    byName: Array.from(byName),
    byImageKey: Array.from(byImageKey),
    nameToLists,
    imageToLists,
    byList,
    catalogLite,
  };
}

export function pushNeededSnapshotToBridge(snapshot: NeededSnapshot): boolean {
  if (typeof window.__pushNeededSnapshot === 'function') {
    window.__pushNeededSnapshot(snapshot);
    return true;
  }
  return false;
}

export function pullAcquisitionDeltasFromBridge(): AcquisitionDelta[] {
  if (typeof window.__pullAcquisitionDeltas === 'function') {
    try {
      const deltas = window.__pullAcquisitionDeltas();
      return Array.isArray(deltas) ? deltas : [];
    } catch {
      return [];
    }
  }
  return [];
}
