import { ReviewProgressUpsertSchema } from '@rayenz-hub/shared';
import { handleKeyedResource } from '../lib/keyed-resource-handler.js';
import { getAppServices, type AppServices } from '../ioc/index.js';

export async function handleReviewProgress(
  method: string,
  fileId: string,
  headers: Record<string, string | undefined>,
  body: string | null | undefined,
  services: AppServices = getAppServices(),
) {
  const repo = services.reviewProgressRepository;
  return handleKeyedResource({
    method,
    key: fileId,
    headers,
    body,
    authService: services.authService,
    schema: ReviewProgressUpsertSchema,
    ops: {
      get: (auth, env, key) => repo.get(auth, env, key),
      put: (auth, env, key, data) => repo.put(auth, env, key, data),
    },
  });
}
