import { SetPoolUpsertSchema } from '@rayenz-hub/shared';
import { handleKeyedResource } from '../lib/keyed-resource-handler.js';
import { getAppServices, type AppServices } from '../ioc/index.js';

export async function handleSetPool(
  method: string,
  codesKey: string,
  headers: Record<string, string | undefined>,
  body: string | null | undefined,
  services: AppServices = getAppServices(),
) {
  const repo = services.setPoolRepository;
  return handleKeyedResource({
    method,
    key: codesKey,
    headers,
    body,
    authService: services.authService,
    schema: SetPoolUpsertSchema,
    ops: {
      get: (auth, env, key) => repo.get(auth, env, key),
      put: (auth, env, key, data) => repo.put(auth, env, key, data),
    },
  });
}
