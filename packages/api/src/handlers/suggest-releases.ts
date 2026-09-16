import {
  SuggestReleasesResponseSchema,
  getPinnedReleaseEntries,
  getReleaseCatalog,
  isRevealDateReached,
  type ReleaseCatalogEntry,
} from '@rayenz-hub/shared';
import { jsonResponse } from '../lib/response.js';
import { mapHandlerError } from '../lib/handler-errors.js';
import { getAppServices, type AppServices } from '../ioc/index.js';

function mergeScheduleIntoReleases(
  releases: ReleaseCatalogEntry[],
  scheduleSets: {
    setCode: string;
    name?: string;
    finalRevealDate: string;
    setPoolStatus?: string;
  }[],
  now = new Date(),
): Array<ReleaseCatalogEntry & { scheduleReady?: boolean; finalRevealDate?: string }> {
  const byId = new Map(
    releases.map((r) => [r.id, { ...r } as ReleaseCatalogEntry & { scheduleReady?: boolean; finalRevealDate?: string }]),
  );

  for (const set of scheduleSets) {
    if (!isRevealDateReached(set.finalRevealDate, now)) continue;
    const code = set.setCode.toUpperCase();
    const id = `group:${code}`;
    const scheduleReady = set.setPoolStatus === 'ready';
    const existing = byId.get(id);
    if (existing) {
      existing.scheduleReady = scheduleReady;
      existing.finalRevealDate = set.finalRevealDate;
      continue;
    }
    byId.set(id, {
      id,
      kind: 'group',
      code,
      name: set.name || code,
      released_at: set.finalRevealDate,
      set_codes: [code],
      scheduleReady,
      finalRevealDate: set.finalRevealDate,
    });
  }

  return [...byId.values()];
}

export async function handleSuggestReleases(
  headers: Record<string, string | undefined>,
  services: AppServices = getAppServices(),
) {
  try {
    await services.authService.authenticate(headers);
    const catalog = getReleaseCatalog();
    const pinned = getPinnedReleaseEntries();
    let scheduleSets: {
      setCode: string;
      name?: string;
      finalRevealDate: string;
      setPoolStatus?: string;
    }[] = [];
    try {
      const schedule = await services.releaseSchedule.getSchedule();
      scheduleSets = schedule.sets;
    } catch {
      scheduleSets = [];
    }
    const merged = mergeScheduleIntoReleases(
      [...pinned, ...catalog.releases],
      scheduleSets,
    );
    const payload = SuggestReleasesResponseSchema.parse({
      ...catalog,
      releases: merged,
    });
    return jsonResponse(200, payload);
  } catch (e) {
    const mapped = mapHandlerError(e, services.authService);
    if (mapped) return mapped;
    throw e;
  }
}
