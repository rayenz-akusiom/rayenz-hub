import type { DeckDocument, DeckSummary } from '@rayenz-hub/shared';
import { DeckDocumentSchema } from '@rayenz-hub/shared';
import { apiFetch, isApiConfigured } from '../../api/hub-api';

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
