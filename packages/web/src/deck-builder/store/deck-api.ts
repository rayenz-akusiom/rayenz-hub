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

export async function apiPostDeckGlance(deckId: string): Promise<Blob> {
  const { getHubApiConfig, assertApiNotPageOrigin } = await import('../../api/hub-api-client');
  const cfg = getHubApiConfig();
  if (!cfg.enabled) {
    throw new Error('Hub API not configured. Set rayenz-hub-api-url and rayenz-hub-api-key in localStorage.');
  }
  assertApiNotPageOrigin(cfg.url);
  const res = await fetch(`${cfg.url}/v1/decks/${encodeURIComponent(deckId)}/glance`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.key}`,
    },
  });
  if (res.status === 401) {
    throw new Error('Hub API unauthorized — check rayenz-hub-api-key.');
  }
  if (!res.ok) {
    const peek = await res.text();
    try {
      const json = JSON.parse(peek) as { error?: string; message?: string };
      throw new Error(json.error || json.message || `Hub API error ${res.status}`);
    } catch (parseErr) {
      if (parseErr instanceof Error && !parseErr.message.startsWith('Unexpected')) throw parseErr;
      throw new Error(`Hub API error ${res.status}: ${peek}`);
    }
  }
  return res.blob();
}
