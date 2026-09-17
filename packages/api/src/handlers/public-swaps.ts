import {
  isSwapAggregateSummary,
  mapPool,
  redactDeckForPublicSwaps,
  SWAP_AGGREGATE_GET_CONCURRENCY,
} from '@rayenz-hub/shared';
import { jsonResponse } from '../lib/response.js';
import { withPublicUser } from '../lib/public-user-handler.js';
import { getAppServices, type AppServices } from '../ioc/index.js';

export async function handlePublicUserSwaps(
  username: string,
  headers: Record<string, string | undefined>,
  services: AppServices = getAppServices(),
) {
  return withPublicUser('publicSwaps', headers, username, services, async (record) => {
    const summaries = await services.deckRepository.listByUserId(record.sub);
    const candidates = summaries.filter(
      (summary) => isSwapAggregateSummary(summary) && summary.visibility !== 'private',
    );

    const loaded = await mapPool(candidates, SWAP_AGGREGATE_GET_CONCURRENCY, async (summary) => {
      const doc = await services.deckRepository.getByUserId(record.sub, summary.deckId);
      if (!doc) return null;
      if (!(doc.formalSwapEntries || []).length && !(doc.lookingForEntries || []).length) {
        return null;
      }
      return redactDeckForPublicSwaps(doc);
    });

    return jsonResponse(200, {
      username: record.username,
      slug: record.slug,
      decks: loaded.filter((d): d is NonNullable<typeof d> => d != null),
    });
  });
}
