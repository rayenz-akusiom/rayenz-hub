import {
  buildGlanceIncludeSet,
  buildGlanceLayoutPlan,
  GLANCE_GENERATION_VERSION,
  resolveUserId,
  type DeckDocument,
  type GlanceLayoutMode,
} from '@rayenz-hub/shared';
import { binaryResponse, errorResponse } from '../lib/response.js';
import { mapHandlerError } from '../lib/handler-errors.js';
import { spendLockResponse } from '../lib/route-policy.js';
import { getAppServices, type AppServices } from '../ioc/index.js';
import { renderGlancePng } from '../services/glance-render.js';
import { createGlanceCacheFromOptions, glancePresignedDeliveryResponse, renderPlanThroughCache, type GlanceHandlerOptions } from './glance-pipeline.js';
import { glanceCacheKey } from '../repositories/glance-cache.js';

function safeFilename(name: string): string {
  return String(name || 'deck')
    .replace(/[^\w\-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'deck';
}

export type DeckGlanceOptions = GlanceHandlerOptions;

type GlanceRequest = {
  lieutenantInstanceIds?: string[];
  mode?: GlanceLayoutMode;
};

function parseGlanceRequest(
  body: string | null | undefined,
): { ok: true; request: GlanceRequest } | { ok: false } {
  if (!body) return { ok: true, request: {} };
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { ok: false };
  }
  if (parsed == null) return { ok: true, request: {} };
  if (typeof parsed !== 'object') return { ok: false };

  const obj = parsed as { lieutenantInstanceIds?: unknown; mode?: unknown };
  const request: GlanceRequest = {};

  if (obj.lieutenantInstanceIds !== undefined && obj.lieutenantInstanceIds !== null) {
    const raw = obj.lieutenantInstanceIds;
    if (!Array.isArray(raw) || raw.some((id) => typeof id !== 'string' || !id)) {
      return { ok: false };
    }
    request.lieutenantInstanceIds = raw as string[];
  }

  if (obj.mode !== undefined && obj.mode !== null) {
    if (obj.mode !== 'type_line' && obj.mode !== 'primary_category') {
      return { ok: false };
    }
    request.mode = obj.mode;
  }

  return { ok: true, request };
}

export async function handleDeckGlance(
  deckId: string,
  headers: Record<string, string | undefined>,
  body: string | null | undefined = null,
  services: AppServices = getAppServices(),
  options: DeckGlanceOptions = {},
) {
  try {
    const { auth, env } = await services.authService.authenticate(headers);
    if (await services.spendLock.isActive()) {
      return spendLockResponse();
    }
    const record = await services.deckRepository.get(auth, env, deckId);
    if (!record) {
      return errorResponse(404, 'Not found', 'NOT_FOUND');
    }

    const deck = record as DeckDocument;
    if (deck.format !== 'commander') {
      return errorResponse(400, 'Glance is supported for Commander decks only.', 'GLANCE_UNSUPPORTED_FORMAT');
    }

    const parsed = parseGlanceRequest(body);
    if (!parsed.ok) {
      return errorResponse(400, 'Invalid request body', 'BAD_REQUEST');
    }

    const includeResult = buildGlanceIncludeSet(deck, {
      lieutenantInstanceIds: parsed.request.lieutenantInstanceIds,
      mode: parsed.request.mode,
    });
    if (!includeResult.ok) {
      return errorResponse(400, includeResult.message, includeResult.code);
    }

    const plan = buildGlanceLayoutPlan(includeResult.includeSet, deck.name || null);
    const userId = resolveUserId(auth, env);
    const { cache, fetchImpl, inlineMaxBytes } = createGlanceCacheFromOptions(env, options, (v, f) =>
      glanceCacheKey(v, f, userId),
    );

    const { png, cacheStatus } = await renderPlanThroughCache({
      generationVersion: GLANCE_GENERATION_VERSION,
      plan,
      cards: deck.cards || [],
      cache,
      options,
      fetchImpl,
      render: renderGlancePng,
    });

    if (png.byteLength > inlineMaxBytes) {
      return glancePresignedDeliveryResponse(
        GLANCE_GENERATION_VERSION,
        plan.fingerprint,
        cacheStatus,
        cache,
        options,
      );
    }

    const filename = `${safeFilename(deck.name)}-glance.png`;
    return binaryResponse(200, png, {
      'content-type': 'image/png',
      'content-disposition': `attachment; filename="${filename}"`,
      'x-glance-cache': cacheStatus,
      'x-glance-generation': GLANCE_GENERATION_VERSION,
    });
  } catch (e) {
    const mapped = mapHandlerError(e, services.authService);
    if (mapped) {
      return mapped;
    }
    throw e;
  }
}
