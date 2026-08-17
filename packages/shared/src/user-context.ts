export interface AuthContext {
  type: 'api-key' | 'jwt' | 'none';
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
 * JWT `sub` is primary. Validated API keys require explicit `HUB_USER_ID`.
 */
export function resolveUserId(auth: AuthContext, env: UserContextEnv = {}): string {
  if (auth.type === 'jwt' && auth.validated && auth.sub) {
    return auth.sub;
  }
  if (auth.type === 'api-key' && auth.validated) {
    if (!env.HUB_USER_ID) {
      throw new Error('Unauthorized');
    }
    return env.HUB_USER_ID;
  }
  throw new Error('Unauthorized');
}
