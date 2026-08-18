import { isTheoryDeck, redactDeckForPublicSwaps } from '@rayenz-hub/shared';
import { mapHandlerError } from '../lib/handler-errors.js';
import { errorResponse, jsonResponse } from '../lib/response.js';
import { clientIp } from '../services/rate-limit.js';
import { resolvePublicUsername } from '../services/username-directory-service.js';
import { getAppServices, type AppServices } from '../ioc/index.js';

export async function handlePublicUserSwaps(
  username: string,
  headers: Record<string, string | undefined>,
  services: AppServices = getAppServices(),
) {
  try {
    await services.rateLimit.consume('publicSwaps', clientIp(headers));
    const record = await resolvePublicUsername(services, username);
    if (!record) {
      return errorResponse(404, 'Not found', 'NOT_FOUND');
    }
    const summaries = await services.deckRepository.listByUserId(record.sub);
    const decks = [];
    for (const summary of summaries) {
      if (summary.format !== 'commander' && summary.format !== 'cube') continue;
      if (isTheoryDeck(summary)) continue;
      if (summary.visibility === 'private') continue;
      const doc = await services.deckRepository.getByUserId(record.sub, summary.deckId);
      if (!doc) continue;
      if (!(doc.formalSwapEntries || []).length && !(doc.lookingForEntries || []).length) {
        continue;
      }
      decks.push(redactDeckForPublicSwaps(doc));
    }
    return jsonResponse(200, {
      username: record.username,
      slug: record.slug,
      decks,
    });
  } catch (e) {
    const mapped = mapHandlerError(e, services.authService);
    if (mapped) return mapped;
    throw e;
  }
}
