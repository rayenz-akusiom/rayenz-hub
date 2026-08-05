import {
  DeckDocumentSchema,
  DeckPatchSchema,
} from '@rayenz-hub/shared';
import { handleKeyedResource, handleListResource, parseJsonBody } from '../lib/keyed-resource-handler.js';
import { mapHandlerError } from '../lib/handler-errors.js';
import { errorResponse, jsonResponse } from '../lib/response.js';
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
  if (method === 'PATCH') {
    return handleDeckPatch(deckId, headers, body, services);
  }

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

async function handleDeckPatch(
  deckId: string,
  headers: Record<string, string | undefined>,
  body: string | null | undefined,
  services: AppServices,
) {
  try {
    const { auth, env } = services.authService.authenticate(headers);
    const parsedBody = parseJsonBody(body);
    if (!parsedBody.ok) {
      return parsedBody.response;
    }
    const result = DeckPatchSchema.safeParse(parsedBody.value);
    if (!result.success) {
      return errorResponse(400, 'Invalid request body', 'BAD_REQUEST');
    }
    const saved = await services.deckRepository.patch(auth, env, deckId, result.data);
    return jsonResponse(200, saved);
  } catch (e) {
    const mapped = mapHandlerError(e, services.authService);
    if (mapped) {
      return mapped;
    }
    throw e;
  }
}
