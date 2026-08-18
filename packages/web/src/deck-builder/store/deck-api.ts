import type { DeckDocument, DeckSummary } from '@rayenz-hub/shared';
import { DeckDocumentSchema } from '@rayenz-hub/shared';
import { apiFetch, isApiConfigured } from '../../api/hub-api';
import { publicApiFetch } from '../../api/hub-api-client';

export async function apiListDecks(): Promise<DeckSummary[]> {
  if (!isApiConfigured()) return [];
  const data = await apiFetch<{ decks?: DeckSummary[] }>('/v1/decks');
  return data?.decks || [];
}

export async function apiGetDeck(deckId: string): Promise<DeckDocument | null> {
  if (!isApiConfigured()) return null;
  const data = await apiFetch<unknown>(`/v1/decks/${encodeURIComponent(deckId)}`);
  if (!data) return null;
  const parsed = DeckDocumentSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
}

export async function apiGetPublicDeck(
  username: string,
  deckSlug: string,
): Promise<DeckDocument | null> {
  const data = await publicApiFetch(
    `/v1/users/${encodeURIComponent(username)}/decks/${encodeURIComponent(deckSlug)}`,
  );
  if (!data) return null;
  const parsed = DeckDocumentSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error('Public deck response was not a valid deck document');
  }
  return parsed.data;
}

export type PublicSwapsPayload = {
  username: string;
  slug: string;
  decks: DeckDocument[];
};

export async function apiGetPublicSwaps(username: string): Promise<PublicSwapsPayload | null> {
  const data = await publicApiFetch(`/v1/users/${encodeURIComponent(username)}/swaps`);
  if (!data) return null;
  const body = data as { username?: unknown; slug?: unknown; decks?: unknown };
  if (typeof body.username !== 'string' || typeof body.slug !== 'string' || !Array.isArray(body.decks)) {
    throw new Error('Public swaps response was not valid');
  }
  const decks: DeckDocument[] = [];
  for (const raw of body.decks) {
    const parsed = DeckDocumentSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error('Public swaps response was not a valid deck document');
    }
    decks.push(parsed.data);
  }
  return { username: body.username, slug: body.slug, decks };
}

export async function apiPutDeck(doc: DeckDocument): Promise<DeckDocument> {
  const body = DeckDocumentSchema.parse(doc);
  const data = await apiFetch<unknown>(`/v1/decks/${encodeURIComponent(body.deckId)}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
  const parsed = DeckDocumentSchema.safeParse(data ?? body);
  return parsed.success ? parsed.data : body;
}

export async function apiDeleteDeck(deckId: string): Promise<void> {
  if (!isApiConfigured()) return;
  await apiFetch(`/v1/decks/${encodeURIComponent(deckId)}`, { method: 'DELETE' });
}

export type { DeckGlanceRequest, DeckGlanceResult } from './deck-glance-api';
export { apiPostDeckGlance } from './deck-glance-api';
