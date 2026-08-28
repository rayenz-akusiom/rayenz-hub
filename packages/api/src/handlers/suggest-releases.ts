import { SuggestReleasesResponseSchema, getPinnedReleaseEntries, getReleaseCatalog } from '@rayenz-hub/shared';
import { jsonResponse } from '../lib/response.js';
import { mapHandlerError } from '../lib/handler-errors.js';
import { getAppServices, type AppServices } from '../ioc/index.js';

export async function handleSuggestReleases(
  headers: Record<string, string | undefined>,
  services: AppServices = getAppServices(),
) {
  try {
    await services.authService.authenticate(headers);
    const catalog = getReleaseCatalog();
    const pinned = getPinnedReleaseEntries();
    const payload = SuggestReleasesResponseSchema.parse({
      ...catalog,
      releases: [...pinned, ...catalog.releases],
    });
    return jsonResponse(200, payload);
  } catch (e) {
    const mapped = mapHandlerError(e, services.authService);
    if (mapped) return mapped;
    throw e;
  }
}
