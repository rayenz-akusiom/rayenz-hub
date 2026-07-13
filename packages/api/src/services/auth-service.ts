import { injectable } from 'inversify';
import type { AuthContext } from '@rayenz-hub/shared';
import { AuthError, parseAuthContext, requireAuth, type ApiEnv } from '../lib/auth.js';

@injectable()
export class AuthService {
  constructor(private readonly env: ApiEnv) {}

  authenticate(headers: Record<string, string | undefined>): { auth: AuthContext; env: ApiEnv } {
    const auth = parseAuthContext(headers, this.env);
    requireAuth(auth);
    return { auth, env: this.env };
  }

  isAuthError(error: unknown): error is AuthError {
    return error instanceof AuthError;
  }
}
