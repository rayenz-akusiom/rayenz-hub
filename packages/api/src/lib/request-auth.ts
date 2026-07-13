import type { AuthContext } from '@rayenz-hub/shared';
import { AuthError, parseAuthContext, readEnv, requireAuth, type ApiEnv } from '../lib/auth.js';

export function withAuth(
  headers: Record<string, string | undefined>,
): { auth: AuthContext; env: ApiEnv } {
  const env = readEnv();
  const auth = parseAuthContext(headers, env);
  requireAuth(auth);
  return { auth, env };
}

export function authErrorResponse(e: unknown) {
  if (e instanceof AuthError) {
    return { statusCode: 401 as const, body: { error: 'Unauthorized', code: 'UNAUTHORIZED' } };
  }
  throw e;
}
