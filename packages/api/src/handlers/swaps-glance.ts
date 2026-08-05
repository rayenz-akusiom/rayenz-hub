import {
  buildSwapGlanceIncludeSet,
  buildSwapGlanceLayoutPlans,
  normalizeSetCodes,
  SWAP_GLANCE_GENERATION_VERSION,
  type DeckDocument,
  type SwapGlanceMode,
  type SwapGlanceRequestItem,
  type WantSourceKind,
} from '@rayenz-hub/shared';
import { binaryResponse, errorResponse, jsonResponse } from '../lib/response.js';
import { mapHandlerError } from '../lib/handler-errors.js';
import { getAppServices, type AppServices } from '../ioc/index.js';
import { swapGlanceCacheKey } from '../repositories/glance-cache.js';
import { renderSwapGlancePng } from '../services/glance-render.js';
import {
  createGlanceCacheFromOptions,
  renderPlanThroughCache,
  type GlanceHandlerOptions,
} from './glance-pipeline.js';

export type SwapsGlanceOptions = GlanceHandlerOptions;

const KINDS = new Set<WantSourceKind>(['seeking', 'queued_in', 'queued_out']);

function parseSwapsGlanceRequest(body: string | null | undefined):
  | {
      ok: true;
      mode: SwapGlanceMode;
      includeSeeking: boolean;
      setCodes: string[];
      items: SwapGlanceRequestItem[];
    }
  | { ok: false; message: string } {
  if (!body) {
    return { ok: false, message: 'Request body is required' };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { ok: false, message: 'Invalid JSON body' };
  }
  if (parsed == null || typeof parsed !== 'object') {
    return { ok: false, message: 'Invalid request body' };
  }
  const raw = parsed as {
    mode?: unknown;
    includeSeeking?: unknown;
    setCodes?: unknown;
    items?: unknown;
  };
  if (raw.mode !== 'full' && raw.mode !== 'in_only') {
    return { ok: false, message: 'mode must be "full" or "in_only"' };
  }
  if (typeof raw.includeSeeking !== 'boolean') {
    return { ok: false, message: 'includeSeeking must be a boolean' };
  }
  if (!Array.isArray(raw.items)) {
    return { ok: false, message: 'items must be an array' };
  }
  let setCodes: string[] = [];
  if (raw.setCodes != null) {
    if (!Array.isArray(raw.setCodes) || raw.setCodes.some((c) => typeof c !== 'string')) {
      return { ok: false, message: 'setCodes must be an array of strings' };
    }
    setCodes = normalizeSetCodes(raw.setCodes as string[]);
  }
  const items: SwapGlanceRequestItem[] = [];
  for (const entry of raw.items) {
    if (entry == null || typeof entry !== 'object') {
      return { ok: false, message: 'Each item must be an object' };
    }
    const item = entry as { deckId?: unknown; kind?: unknown; entryId?: unknown };
    if (typeof item.deckId !== 'string' || !item.deckId) {
      return { ok: false, message: 'item.deckId is required' };
    }
    if (typeof item.entryId !== 'string' || !item.entryId) {
      return { ok: false, message: 'item.entryId is required' };
    }
    if (typeof item.kind !== 'string' || !KINDS.has(item.kind as WantSourceKind)) {
      return { ok: false, message: 'item.kind must be seeking, queued_in, or queued_out' };
    }
    items.push({
      deckId: item.deckId,
      kind: item.kind as WantSourceKind,
      entryId: item.entryId,
    });
  }
  return {
    ok: true,
    mode: raw.mode,
    includeSeeking: raw.includeSeeking,
    setCodes,
    items,
  };
}

function uint8ToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

type PageImageResult = {
  index: number;
  fingerprint: string;
  cache: 'HIT' | 'MISS';
  png: Uint8Array;
};

export async function handleSwapsGlance(
  headers: Record<string, string | undefined>,
  body: string | null | undefined = null,
  services: AppServices = getAppServices(),
  options: SwapsGlanceOptions = {},
) {
  try {
    const { auth, env } = services.authService.authenticate(headers);
    const request = parseSwapsGlanceRequest(body);
    if (!request.ok) {
      return errorResponse(400, request.message, 'BAD_REQUEST');
    }

    const deckIds = [...new Set(request.items.map((i) => i.deckId))];
    const decks: DeckDocument[] = [];
    for (const deckId of deckIds) {
      const record = await services.deckRepository.get(auth, env, deckId);
      if (!record) {
        return errorResponse(404, `Deck not found: ${deckId}`, 'NOT_FOUND');
      }
      decks.push(record as DeckDocument);
    }

    const includeResult = buildSwapGlanceIncludeSet(decks, request.items, {
      mode: request.mode,
      includeSeeking: request.includeSeeking,
      filterSetCodes: request.setCodes,
    });
    if (!includeResult.ok) {
      return errorResponse(400, includeResult.message, includeResult.code);
    }

    const layout = buildSwapGlanceLayoutPlans(includeResult.includeSet);
    const plans = layout.plans;
    const { cache, fetchImpl, inlineMaxBytes } = createGlanceCacheFromOptions(
      env,
      options,
      swapGlanceCacheKey,
    );

    const pages: PageImageResult[] = [];
    let sharedImageCache: Map<string, Uint8Array> | null = null;
    const allCards = decks.flatMap((d) => d.cards || []);
    for (const plan of plans) {
      const rendered = await renderPlanThroughCache({
        generationVersion: SWAP_GLANCE_GENERATION_VERSION,
        plan,
        cards: allCards,
        cache,
        options,
        fetchImpl,
        render: renderSwapGlancePng,
        sharedImageCache,
      });
      sharedImageCache = rendered.imageCache;
      pages.push({
        index: plan.pageIndex ?? 1,
        fingerprint: plan.fingerprint,
        cache: rendered.cacheStatus,
        png: rendered.png,
      });
    }

    const pageCount = pages.length;
    const allInline = pages.every((p) => p.png.byteLength <= inlineMaxBytes);
    const overallCache =
      pages.every((p) => p.cache === 'HIT') ? 'HIT' : pages.some((p) => p.cache === 'HIT') ? 'PARTIAL' : 'MISS';

    // Single page under inline limit: keep binary PNG response for compatibility.
    if (pageCount === 1 && allInline) {
      const only = pages[0]!;
      return binaryResponse(200, only.png, {
        'content-type': 'image/png',
        'content-disposition': 'attachment; filename="swaps-at-a-glance.png"',
        'x-glance-cache': only.cache,
        'x-glance-generation': SWAP_GLANCE_GENERATION_VERSION,
        'x-glance-page-count': '1',
        'x-glance-densify': layout.densifyStage,
      });
    }

    // Multi-page or oversized: JSON bundle.
    const images: Array<Record<string, unknown>> = [];
    for (const page of pages) {
      if (page.png.byteLength > inlineMaxBytes) {
        const presigned = options.presignGet
          ? await options.presignGet(SWAP_GLANCE_GENERATION_VERSION, page.fingerprint)
          : await cache.presignGet(SWAP_GLANCE_GENERATION_VERSION, page.fingerprint);
        images.push({
          index: page.index,
          delivery: 'presigned',
          url: presigned.url,
          expiresAt: presigned.expiresAt,
          cache: page.cache,
        });
      } else {
        images.push({
          index: page.index,
          delivery: 'inline',
          pngBase64: uint8ToBase64(page.png),
          cache: page.cache,
        });
      }
    }

    return jsonResponse(200, {
      delivery: 'bundle',
      pageCount,
      densifyStage: layout.densifyStage,
      omittedCardCount: layout.omittedCardCount,
      images,
      generation: SWAP_GLANCE_GENERATION_VERSION,
      cache: overallCache,
    });
  } catch (e) {
    const mapped = mapHandlerError(e, services.authService);
    if (mapped) {
      return mapped;
    }
    throw e;
  }
}
