import { DeckDocumentSchema } from '@rayenz-hub/shared';
import { errorResponse, jsonResponse } from '../lib/response.js';
import { mapHandlerError } from '../lib/handler-errors.js';
import { getAppServices, type AppServices } from '../ioc/index.js';

export async function handleListDecks(
  headers: Record<string, string | undefined>,
  services: AppServices = getAppServices(),
) {
  try {
    const { auth, env } = services.authService.authenticate(headers);
    const decks = await services.deckRepository.list(auth, env);
    return jsonResponse(200, { decks });
  } catch (e) {
    const mapped = mapHandlerError(e, services.authService);
    if (mapped) {
      return mapped;
    }
    throw e;
  }
}

export async function handleDeck(
  method: string,
  deckId: string,
  headers: Record<string, string | undefined>,
  body: string | null | undefined,
  services: AppServices = getAppServices(),
) {
  try {
    const { auth, env } = services.authService.authenticate(headers);
    const repo = services.deckRepository;

    if (method === 'GET') {
      const record = await repo.get(auth, env, deckId);
      if (!record) {
        return errorResponse(404, 'Not found', 'NOT_FOUND');
      }
      return jsonResponse(200, record);
    }

    if (method === 'PUT') {
      let parsed: unknown;
      try {
        parsed = body ? JSON.parse(body) : null;
      } catch {
        return errorResponse(400, 'Invalid JSON body', 'BAD_REQUEST');
      }
      const docBody =
        parsed && typeof parsed === 'object' && parsed !== null && 'document' in parsed
          ? (parsed as { document: unknown }).document
          : parsed;
      const result = DeckDocumentSchema.safeParse(docBody);
      if (!result.success) {
        return errorResponse(400, 'Invalid request body', 'BAD_REQUEST');
      }
      const saved = await repo.put(auth, env, deckId, result.data);
      return jsonResponse(200, saved);
    }

    if (method === 'DELETE') {
      const ok = await repo.delete(auth, env, deckId);
      if (!ok) {
        return errorResponse(404, 'Not found', 'NOT_FOUND');
      }
      return {
        statusCode: 204,
        headers: { 'content-type': 'application/json' },
        body: '',
      };
    }

    return errorResponse(405, 'Method not allowed', 'METHOD_NOT_ALLOWED');
  } catch (e) {
    const mapped = mapHandlerError(e, services.authService);
    if (mapped) {
      return mapped;
    }
    throw e;
  }
}
