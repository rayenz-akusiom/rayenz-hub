import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { mapHandlerError } from './handler-errors.js';
import { errorResponse } from './response.js';
import { clientIp } from '../services/rate-limit.js';
import { resolvePublicUsername } from '../services/username-directory-service.js';
import type { UsernameRecord } from '../repositories/username-directory.js';
import type { AppServices } from '../ioc/app-services.js';

/**
 * Shared public-handler gate: rate limit → resolve username → 404 → product fn → mapHandlerError.
 * Keep product bodies (list/filter/load) in the handlers; pass distinct rate kinds.
 */
export async function withPublicUser(
  rateKind: 'publicDeck' | 'publicSwaps',
  headers: Record<string, string | undefined>,
  username: string,
  services: AppServices,
  fn: (record: UsernameRecord) => Promise<APIGatewayProxyResultV2>,
): Promise<APIGatewayProxyResultV2> {
  try {
    await services.rateLimit.consume(rateKind, clientIp(headers));
    const record = await resolvePublicUsername(services, username);
    if (!record) {
      return errorResponse(404, 'Not found', 'NOT_FOUND');
    }
    return await fn(record);
  } catch (e) {
    const mapped = mapHandlerError(e, services.authService);
    if (mapped) return mapped;
    throw e;
  }
}
