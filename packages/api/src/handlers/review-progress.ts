import { ReviewProgressUpsertSchema } from '@rayenz-hub/shared';
import { errorResponse, jsonResponse } from '../lib/response.js';
import { mapHandlerError } from '../lib/handler-errors.js';
import { getAppServices, type AppServices } from '../ioc/index.js';

export async function handleReviewProgress(
  method: string,
  fileId: string,
  headers: Record<string, string | undefined>,
  body: string | null | undefined,
  services: AppServices = getAppServices(),
) {
  try {
    const { auth, env } = services.authService.authenticate(headers);
    const repo = services.reviewProgressRepository;

    if (method === 'GET') {
      const record = await repo.get(auth, env, fileId);
      if (!record) {
        return errorResponse(404, 'Not found', 'NOT_FOUND');
      }
      return jsonResponse(200, record);
    }

    if (method === 'PUT') {
      let parsed: unknown;
      try {
        parsed = body ? JSON.parse(body) : null;
      } catch {
        return errorResponse(400, 'Invalid JSON body', 'BAD_REQUEST');
      }
      const result = ReviewProgressUpsertSchema.safeParse(parsed);
      if (!result.success) {
        return errorResponse(400, 'Invalid request body', 'BAD_REQUEST');
      }
      const saved = await repo.put(auth, env, fileId, result.data);
      return jsonResponse(200, saved);
    }

    return errorResponse(405, 'Method not allowed', 'METHOD_NOT_ALLOWED');
  } catch (e) {
    const mapped = mapHandlerError(e, services.authService);
    if (mapped) {
      return mapped;
    }
    throw e;
  }
}
