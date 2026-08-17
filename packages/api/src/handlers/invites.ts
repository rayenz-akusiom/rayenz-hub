import { resolveUserId } from '@rayenz-hub/shared';
import { ForbiddenError } from '../lib/auth.js';
import { mapHandlerError } from '../lib/handler-errors.js';
import { errorResponse, jsonResponse } from '../lib/response.js';
import { clientIp } from '../services/rate-limit.js';
import { getAppServices, type AppServices } from '../ioc/index.js';

export async function handleInvites(
  method: string,
  headers: Record<string, string | undefined>,
  services: AppServices = getAppServices(),
) {
  try {
    const { auth, env } = await services.authService.authenticate(headers);
    if (!services.authService.isOwner(auth)) {
      throw new ForbiddenError('Only the owner can manage invites');
    }
    const ownerSub = resolveUserId(auth, env);
    if (method === 'POST') {
      await services.rateLimit.consume('invite', clientIp(headers));
      if (await services.spendLock.isActive()) {
        /* create optional deny under lock */
        throw new ForbiddenError(
          'Cloud spend lock-down is active; try again next billing period.',
          'SPEND_LOCK',
        );
      }
      const created = await services.inviteService.create(ownerSub);
      return jsonResponse(200, created);
    }
    if (method === 'GET') {
      const invites = await services.inviteService.list(ownerSub);
      return jsonResponse(200, { invites });
    }
    return errorResponse(405, 'Method not allowed', 'METHOD_NOT_ALLOWED');
  } catch (e) {
    const mapped = mapHandlerError(e, services.authService);
    if (mapped) return mapped;
    throw e;
  }
}

export async function handleInviteRevoke(
  inviteId: string,
  headers: Record<string, string | undefined>,
  services: AppServices = getAppServices(),
) {
  try {
    const { auth, env } = await services.authService.authenticate(headers);
    if (!services.authService.isOwner(auth)) {
      throw new ForbiddenError('Only the owner can manage invites');
    }
    await services.inviteService.revoke(resolveUserId(auth, env), inviteId);
    return jsonResponse(200, { ok: true });
  } catch (e) {
    const mapped = mapHandlerError(e, services.authService);
    if (mapped) return mapped;
    throw e;
  }
}
