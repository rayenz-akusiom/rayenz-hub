import { CognitoJwtVerifier } from 'aws-jwt-verify';
import type { AuthContext } from '@rayenz-hub/shared';
import type { ApiEnv } from './auth.js';

type AccessVerifier = {
  verify: (token: string) => Promise<{ sub?: string; username?: string; 'cognito:username'?: string }>;
};

let cachedVerifier: AccessVerifier | undefined;
let cachedVerifierKey = '';

export function encodeTestJwt(payload: { sub: string; username?: string }): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(
    JSON.stringify({
      sub: payload.sub,
      username: payload.username,
      'cognito:username': payload.username,
    }),
  ).toString('base64url');
  return `${header}.${body}.test`;
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }
  try {
    const json = Buffer.from(parts[1], 'base64url').toString('utf8');
    const parsed = JSON.parse(json) as Record<string, unknown>;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function contextFromPayload(payload: Record<string, unknown>): AuthContext {
  const sub = typeof payload.sub === 'string' ? payload.sub : undefined;
  const username =
    (typeof payload['cognito:username'] === 'string' && payload['cognito:username']) ||
    (typeof payload.username === 'string' && payload.username) ||
    undefined;
  if (!sub) {
    return { type: 'jwt', validated: false };
  }
  return { type: 'jwt', validated: true, sub, username };
}

function getVerifier(env: ApiEnv): AccessVerifier | null {
  const poolId = env.COGNITO_USER_POOL_ID?.trim();
  const clientId = env.COGNITO_CLIENT_ID?.trim();
  if (!poolId || !clientId) {
    return null;
  }
  const key = `${poolId}:${clientId}`;
  if (cachedVerifier && cachedVerifierKey === key) {
    return cachedVerifier;
  }
  cachedVerifier = CognitoJwtVerifier.create({
    userPoolId: poolId,
    tokenUse: 'access',
    clientId,
  });
  cachedVerifierKey = key;
  return cachedVerifier;
}

export async function verifyBearerJwt(token: string, env: ApiEnv): Promise<AuthContext> {
  if (env.HUB_JWT_TEST_MODE === 'true' || env.HUB_JWT_TEST_MODE === '1') {
    const payload = decodeJwtPayload(token);
    if (!payload) {
      return { type: 'jwt', validated: false };
    }
    return contextFromPayload(payload);
  }
  const verifier = getVerifier(env);
  if (!verifier) {
    return { type: 'jwt', validated: false };
  }
  try {
    const payload = await verifier.verify(token);
    return contextFromPayload(payload as Record<string, unknown>);
  } catch {
    return { type: 'jwt', validated: false };
  }
}

export function looksLikeJwt(token: string): boolean {
  return token.split('.').length === 3;
}
