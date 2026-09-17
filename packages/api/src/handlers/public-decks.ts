import { previewDecksPerFormat, profileLookupKeys, type DeckDocument } from '@rayenz-hub/shared';
import { errorResponse, jsonResponse } from '../lib/response.js';
import { withPublicUser } from '../lib/public-user-handler.js';
import type { UsernameRecord } from '../repositories/username-directory.js';
import { getAppServices, type AppServices } from '../ioc/index.js';

async function getPublicUserDeck(
  record: UsernameRecord,
  deckSlug: string,
  services: AppServices,
): Promise<DeckDocument | null> {
  return services.deckRepository.getByUserIdAndSlug(record.sub, deckSlug);
}

function parsePreviewPerFormat(raw: string | undefined): number | null {
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.min(50, Math.floor(n));
}

/** Public library index: summaries with visibility !== private. */
export async function handlePublicUserDecks(
  username: string,
  headers: Record<string, string | undefined>,
  services: AppServices = getAppServices(),
  query?: { previewPerFormat?: string | undefined },
) {
  return withPublicUser('publicDeck', headers, username, services, async (record) => {
    const summaries = await services.deckRepository.listByUserId(record.sub);
    let decks = summaries.filter((s) => s.visibility !== 'private');
    const previewLimit = parsePreviewPerFormat(query?.previewPerFormat);
    if (previewLimit != null) {
      decks = previewDecksPerFormat(decks, previewLimit);
    }
    return jsonResponse(200, {
      username: record.username,
      slug: record.slug,
      decks,
    });
  });
}

export async function handlePublicUserDeck(
  username: string,
  deckSlug: string,
  headers: Record<string, string | undefined>,
  services: AppServices = getAppServices(),
) {
  return withPublicUser('publicDeck', headers, username, services, async (record) => {
    const doc = await getPublicUserDeck(record, deckSlug, services);
    if (!doc) {
      return errorResponse(404, 'Not found', 'NOT_FOUND');
    }
    return jsonResponse(200, doc);
  });
}

export async function handlePublicUserDeckProfile(
  username: string,
  deckSlug: string,
  headers: Record<string, string | undefined>,
  services: AppServices = getAppServices(),
) {
  return withPublicUser('publicDeck', headers, username, services, async (record) => {
    const doc = await getPublicUserDeck(record, deckSlug, services);
    if (!doc) {
      return errorResponse(404, 'Not found', 'NOT_FOUND');
    }
    for (const key of profileLookupKeys(doc)) {
      const profile = await services.profileRepository.getByUserId(record.sub, key);
      if (profile?.yaml) {
        return jsonResponse(200, { yaml: profile.yaml, deckId: profile.deckId });
      }
    }
    return errorResponse(404, 'Not found', 'NOT_FOUND');
  });
}
