import { ProfileUpsertSchema } from '@rayenz-hub/shared';
import { handleKeyedResource, handleListResource } from '../lib/keyed-resource-handler.js';
import { getAppServices, type AppServices } from '../ioc/index.js';

export async function handleListProfiles(
  headers: Record<string, string | undefined>,
  services: AppServices = getAppServices(),
) {
  return handleListResource({
    headers,
    authService: services.authService,
    collectionKey: 'profiles',
    list: (auth, env) => services.profileRepository.list(auth, env),
  });
}

export async function handleProfile(
  method: string,
  deckId: string,
  headers: Record<string, string | undefined>,
  body: string | null | undefined,
  services: AppServices = getAppServices(),
) {
  const repo = services.profileRepository;
  return handleKeyedResource({
    method,
    key: deckId,
    headers,
    body,
    authService: services.authService,
    schema: ProfileUpsertSchema,
    ops: {
      get: (auth, env, key) => repo.get(auth, env, key),
      put: (auth, env, key, data) => repo.put(auth, env, key, data),
    },
  });
}
