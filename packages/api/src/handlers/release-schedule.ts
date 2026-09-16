import { ReleaseSchedulePutSchema } from '@rayenz-hub/shared';
import { mapHandlerError } from '../lib/handler-errors.js';
import { errorResponse, jsonResponse } from '../lib/response.js';
import { getAppServices, type AppServices } from '../ioc/index.js';

export async function handleReleaseSchedule(
  method: string,
  headers: Record<string, string | undefined>,
  body: string | null | undefined,
  services: AppServices = getAppServices(),
) {
  try {
    const { auth } = await services.authService.authenticate(headers);
    if (method === 'GET') {
      const document = await services.releaseSchedule.getSchedule();
      return jsonResponse(200, document);
    }
    if (method === 'PUT') {
      services.authService.requireOwner(auth);
      const parsed = ReleaseSchedulePutSchema.parse(body ? JSON.parse(body) : {});
      const document = await services.releaseSchedule.putSchedule(parsed.sets, {
        updatedBy: auth.username || auth.sub,
      });
      return jsonResponse(200, document);
    }
    return errorResponse(405, 'Method not allowed', 'METHOD_NOT_ALLOWED');
  } catch (e) {
    const mapped = mapHandlerError(e, services.authService);
    if (mapped) return mapped;
    throw e;
  }
}
