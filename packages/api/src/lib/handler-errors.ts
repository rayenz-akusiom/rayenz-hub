import { BadRequestError, NotFoundError } from '../lib/auth.js';
import { errorResponse } from '../lib/response.js';
import type { AuthService } from '../services/auth-service.js';

export function unauthorizedResponse() {
  return errorResponse(401, 'Unauthorized', 'UNAUTHORIZED');
}

export function mapHandlerError(e: unknown, authService: AuthService) {
  if (authService.isAuthError(e)) {
    return unauthorizedResponse();
  }
  if (e instanceof NotFoundError) {
    return errorResponse(404, e.message, 'NOT_FOUND');
  }
  if (e instanceof BadRequestError) {
    return errorResponse(400, e.message, 'BAD_REQUEST');
  }
  if (e instanceof Error && e.message === 'Invalid domain') {
    return errorResponse(400, 'Invalid settings domain', 'BAD_REQUEST');
  }
  return null;
}
