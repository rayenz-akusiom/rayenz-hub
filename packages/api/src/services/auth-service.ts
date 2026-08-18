import { injectable } from 'inversify';
import { normalizeUsername, type AuthContext } from '@rayenz-hub/shared';
import { AuthError, ForbiddenError, parseAuthContextAsync, requireAuth, type ApiEnv } from '../lib/auth.js';

@injectable()
export class AuthService {
  constructor(private readonly env: ApiEnv) {}

  async authenticate(headers: Record<string, string | undefined>): Promise<{ auth: AuthContext; env: ApiEnv }> {
    const auth = await parseAuthContextAsync(headers, this.env);
    requireAuth(auth);
    return { auth, env: this.env };
  }

  async tryAuthenticate(
    headers: Record<string, string | undefined>,
  ): Promise<{ auth: AuthContext; env: ApiEnv }> {
    const auth = await parseAuthContextAsync(headers, this.env);
    return { auth, env: this.env };
  }

  isOwner(auth: AuthContext): boolean {
    const ownerName = this.env.HUB_OWNER_USERNAME || 'Rayenz';
    if (auth.username && normalizeUsername(auth.username) === normalizeUsername(ownerName)) {
      return true;
    }
    if (this.env.HUB_OWNER_SUB && auth.sub && auth.sub === this.env.HUB_OWNER_SUB) {
      return true;
    }
    return false;
  }

  requireOwner(auth: AuthContext): void {
    if (!this.isOwner(auth)) {
      throw new ForbiddenError('Only the owner can use this endpoint', 'OWNER_REQUIRED');
    }
  }

  ownerUsername(): string {
    return this.env.HUB_OWNER_USERNAME || 'Rayenz';
  }

  isAuthError(error: unknown): error is AuthError {
    return error instanceof AuthError;
  }
}
