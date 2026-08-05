import { postGlanceRequest, resolveInlineOrPresignedPng } from '../../lib/glance-http';

export type DeckGlanceResult = {
  blob: Blob;
  cache: string | null;
  generation: string | null;
  delivery: 'inline' | 'presigned';
};

export type DeckGlanceRequest = {
  /** Lieutenants to highlight on the glance plate; defaults to the auto-pick. */
  lieutenantInstanceIds?: string[];
  /** Partition mode: type-line Main+Lands (default) or primary categories. */
  mode?: 'type_line' | 'primary_category';
};

export async function apiPostDeckGlance(
  deckId: string,
  request: DeckGlanceRequest = {},
): Promise<DeckGlanceResult> {
  const res = await postGlanceRequest(
    `/v1/decks/${encodeURIComponent(deckId)}/glance`,
    request,
  );
  const resolved = await resolveInlineOrPresignedPng(res, 'glance');
  if (resolved.kind === 'png') {
    return {
      blob: resolved.blob,
      cache: resolved.cache,
      generation: resolved.generation,
      delivery: resolved.delivery,
    };
  }
  throw new Error('Unexpected glance API response.');
}
