import {
  fetchImageBlob,
  glanceResponseMeta,
  postGlanceRequest,
} from '../../lib/glance-http';

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
  const { cache, generation, contentType } = glanceResponseMeta(res);

  if (contentType.includes('application/json')) {
    const body = (await res.json()) as {
      delivery?: string;
      url?: string;
      cache?: string;
      generation?: string;
    };
    if (body.delivery === 'presigned' && body.url) {
      const blob = await fetchImageBlob(body.url, 'glance');
      return {
        blob,
        cache: body.cache ?? null,
        generation: body.generation ?? null,
        delivery: 'presigned',
      };
    }
    throw new Error('Unexpected glance API response.');
  }

  const blob = await res.blob();
  return {
    blob,
    cache,
    generation,
    delivery: 'inline',
  };
}
