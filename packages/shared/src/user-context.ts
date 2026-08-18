export interface AuthContext {
  type: 'jwt' | 'none';
  validated: boolean;
  sub?: string;
  username?: string;
}

export interface UserContextEnv {
  HUB_USER_ID?: string;
}

/** Bootstrap partition id — used only by the one-shot migration helper. */
export const BOOTSTRAP_USER_ID = 'default';

/**
 * Sole source of DynamoDB partition userId.
 * JWT `sub` is the only identity.
 */
export function resolveUserId(auth: AuthContext, _env: UserContextEnv = {}): string {
  if (auth.type === 'jwt' && auth.validated && auth.sub) {
    return auth.sub;
  }
  throw new Error('Unauthorized');
}
