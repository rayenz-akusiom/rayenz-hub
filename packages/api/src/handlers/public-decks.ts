import { isReservedUsername, type DeckDocument } from '@rayenz-hub/shared';
import { profileLookupKeys } from '../lib/profile-keys.js';
import { mapHandlerError } from '../lib/handler-errors.js';
import { errorResponse, jsonResponse } from '../lib/response.js';
import { clientIp } from '../services/rate-limit.js';
import { getAppServices, type AppServices } from '../ioc/index.js';

async function resolvePublicUserDeck(
  username: string,
  deckSlug: string,
  services: AppServices,
): Promise<{ sub: string; doc: DeckDocument } | null> {
  if (isReservedUsername(username)) {
    return null;
  }
  const record = await services.usernameDirectory.resolve(
    username,
    services.cognitoAuth,
    services.authService.ownerUsername(),
  );
  if (!record) {
    return null;
  }
  const doc = await services.deckRepository.getByUserIdAndSlug(record.sub, deckSlug);
  if (!doc) {
    return null;
  }
  return { sub: record.sub, doc };
}

export async function handlePublicUserDeck(
  username: string,
  deckSlug: string,
  headers: Record<string, string | undefined>,
  services: AppServices = getAppServices(),
) {
  try {
    await services.rateLimit.consume('publicDeck', clientIp(headers));
    const resolved = await resolvePublicUserDeck(username, deckSlug, services);
    if (!resolved) {
      return errorResponse(404, 'Not found', 'NOT_FOUND');
    }
    return jsonResponse(200, resolved.doc);
  } catch (e) {
    const mapped = mapHandlerError(e, services.authService);
    if (mapped) return mapped;
    throw e;
  }
}

export async function handlePublicUserDeckProfile(
  username: string,
  deckSlug: string,
  headers: Record<string, string | undefined>,
  services: AppServices = getAppServices(),
) {
  try {
    await services.rateLimit.consume('publicDeck', clientIp(headers));
    const resolved = await resolvePublicUserDeck(username, deckSlug, services);
    if (!resolved) {
      return errorResponse(404, 'Not found', 'NOT_FOUND');
    }
    for (const key of profileLookupKeys(resolved.doc)) {
      const profile = await services.profileRepository.getByUserId(resolved.sub, key);
      if (profile?.yaml) {
        return jsonResponse(200, { yaml: profile.yaml, deckId: profile.deckId });
      }
    }
    return errorResponse(404, 'Not found', 'NOT_FOUND');
  } catch (e) {
    const mapped = mapHandlerError(e, services.authService);
    if (mapped) return mapped;
    throw e;
  }
}
