export interface AuthContext {
  type: 'api-key' | 'jwt' | 'none';
  validated: boolean;
  sub?: string;
}

export interface UserContextEnv {
  HUB_USER_ID?: string;
}

/**
 * Sole source of DynamoDB partition userId. Bootstrap fallback `default` lives
 * only here (FR-015); removed when Cognito migration ships.
 */
export function resolveUserId(auth: AuthContext, env: UserContextEnv = {}): string {
  if (auth.type === 'jwt' && auth.validated && auth.sub) {
    return auth.sub;
  }
  if (auth.type === 'api-key' && auth.validated) {
    return env.HUB_USER_ID || 'default';
  }
  throw new Error('Unauthorized');
}
