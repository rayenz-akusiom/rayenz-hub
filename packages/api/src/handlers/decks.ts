import { DeckDocumentSchema } from '@rayenz-hub/shared';
import { handleKeyedResource, handleListResource } from '../lib/keyed-resource-handler.js';
import { getAppServices, type AppServices } from '../ioc/index.js';

export async function handleListDecks(
  headers: Record<string, string | undefined>,
  services: AppServices = getAppServices(),
) {
  return handleListResource({
    headers,
    authService: services.authService,
    collectionKey: 'decks',
    list: (auth, env) => services.deckRepository.list(auth, env),
  });
}

export async function handleDeck(
  method: string,
  deckId: string,
  headers: Record<string, string | undefined>,
  body: string | null | undefined,
  services: AppServices = getAppServices(),
) {
  const repo = services.deckRepository;
  return handleKeyedResource({
    method,
    key: deckId,
    headers,
    body,
    authService: services.authService,
    schema: DeckDocumentSchema,
    unwrapDocument: true,
    ops: {
      get: (auth, env, key) => repo.get(auth, env, key),
      put: (auth, env, key, data) => repo.put(auth, env, key, data),
      delete: (auth, env, key) => repo.delete(auth, env, key),
    },
  });
}
