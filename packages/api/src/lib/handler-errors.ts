import { BadRequestError, ConflictError, ForbiddenError, NotFoundError, TooManyRequestsError } from '../lib/auth.js';
import { errorResponse, jsonResponse } from '../lib/response.js';
import type { AuthService } from '../services/auth-service.js';
import { DeckPatchApplyError } from '@rayenz-hub/shared';

export function unauthorizedResponse() {
  return errorResponse(401, 'Unauthorized', 'UNAUTHORIZED');
}

export function mapHandlerError(e: unknown, authService: AuthService) {
  if (authService.isAuthError(e)) {
    return unauthorizedResponse();
  }
  if (e instanceof TooManyRequestsError) {
    return errorResponse(429, e.message, 'RATE_LIMITED');
  }
  if (e instanceof ForbiddenError) {
    if (e.code === 'SPEND_LOCK') {
      return jsonResponse(403, {
        error: 'SPEND_LOCK',
        message: e.message,
        code: 'SPEND_LOCK',
      });
    }
    return errorResponse(403, e.message, e.code);
  }
  if (e instanceof NotFoundError) {
    return errorResponse(404, e.message, 'NOT_FOUND');
  }
  if (e instanceof ConflictError) {
    return errorResponse(409, e.message, 'CONFLICT');
  }
  if (e instanceof DeckPatchApplyError) {
    if (e.code === 'CONFLICT') {
      return errorResponse(409, e.message, 'CONFLICT');
    }
    return errorResponse(400, e.message, e.code);
  }
  if (e instanceof BadRequestError) {
    return errorResponse(400, e.message, 'BAD_REQUEST');
  }
  if (e instanceof Error && e.message === 'Invalid domain') {
    return errorResponse(400, 'Invalid settings domain', 'BAD_REQUEST');
  }
  return null;
}

export function mapScryfallUpstreamError(e: unknown): ReturnType<typeof errorResponse> | null {
  const code = (e as { code?: string })?.code;
  if (code === 'SCRYFALL_RATE_LIMIT') {
    return errorResponse(429, (e as Error).message, 'SCRYFALL_RATE_LIMIT');
  }
  if (code === 'SCRYFALL_UPSTREAM') {
    return errorResponse(502, 'Scryfall request failed — try again in a moment.', 'SCRYFALL_UPSTREAM');
  }
  const msg = e instanceof Error ? e.message : '';
  if (/^Scryfall \d+/.test(msg)) {
    if (msg.includes('429')) {
      return errorResponse(429, 'Scryfall rate limit — try again in a moment.', 'SCRYFALL_RATE_LIMIT');
    }
    return errorResponse(502, 'Scryfall request failed — try again in a moment.', 'SCRYFALL_UPSTREAM');
  }
  return null;
}
