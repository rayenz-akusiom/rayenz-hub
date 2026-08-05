import { SettingsUpsertSchema } from '@rayenz-hub/shared';
import { handleKeyedResource } from '../lib/keyed-resource-handler.js';
import { getAppServices, type AppServices } from '../ioc/index.js';

export async function handleSettings(
  method: string,
  domain: string,
  headers: Record<string, string | undefined>,
  body: string | null | undefined,
  services: AppServices = getAppServices(),
) {
  const repo = services.settingsRepository;
  return handleKeyedResource({
    method,
    key: domain,
    headers,
    body,
    authService: services.authService,
    schema: SettingsUpsertSchema,
    ops: {
      get: (auth, env, key) => repo.get(auth, env, key),
      put: (auth, env, key, data) => repo.put(auth, env, key, data),
    },
  });
}
