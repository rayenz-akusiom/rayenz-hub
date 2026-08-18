import { isReservedUsername } from '@rayenz-hub/shared';
import { mapHandlerError } from '../lib/handler-errors.js';
import { errorResponse, jsonResponse } from '../lib/response.js';
import { clientIp } from '../services/rate-limit.js';
import { getAppServices, type AppServices } from '../ioc/index.js';

export async function handlePublicUserDeck(
  username: string,
  deckSlug: string,
  headers: Record<string, string | undefined>,
  services: AppServices = getAppServices(),
) {
  try {
    await services.rateLimit.consume('publicDeck', clientIp(headers));
    if (isReservedUsername(username)) {
      return errorResponse(404, 'Not found', 'NOT_FOUND');
    }
    const record = await services.usernameDirectory.resolve(
      username,
      services.cognitoAuth,
      services.authService.ownerUsername(),
    );
    if (!record) {
      return errorResponse(404, 'Not found', 'NOT_FOUND');
    }
    const doc = await services.deckRepository.getByUserIdAndSlug(record.sub, deckSlug);
    if (!doc) {
      return errorResponse(404, 'Not found', 'NOT_FOUND');
    }
    return jsonResponse(200, doc);
  } catch (e) {
    const mapped = mapHandlerError(e, services.authService);
    if (mapped) return mapped;
    throw e;
  }
}
