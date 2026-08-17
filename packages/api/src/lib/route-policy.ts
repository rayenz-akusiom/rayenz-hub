import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import { jsonResponse } from './response.js';
import { ForbiddenError } from './auth.js';
import type { SpendLockService } from '../services/spend-lock.js';

export type RouteClass = 'health' | 'sign-in' | 'refresh' | 'register' | 'expensive' | 'ordinary' | 'invite-admin';

export function classifyPath(method: string, path: string): RouteClass {
  if (method === 'GET' && path === '/v1/health') return 'health';
  if (method === 'POST' && path === '/v1/auth/sign-in') return 'sign-in';
  if (method === 'POST' && path === '/v1/auth/refresh') return 'refresh';
  if (method === 'POST' && path === '/v1/auth/register') return 'register';
  if (method === 'POST' && path === '/v1/auth/sign-out') return 'ordinary';
  if (method === 'GET' && path === '/v1/auth/me') return 'ordinary';
  if (path === '/v1/invites' || path.startsWith('/v1/invites/')) return 'invite-admin';
  if (method === 'POST' && (path.endsWith('/glance') || path === '/v1/swaps/glance' || path === '/v1/suggest/generate')) {
    return 'expensive';
  }
  return 'ordinary';
}

export function spendLockResponse(): APIGatewayProxyResultV2 {
  return jsonResponse(403, {
    error: 'SPEND_LOCK',
    message: 'Cloud spend lock-down is active; try again next billing period.',
    code: 'SPEND_LOCK',
  });
}

/** Throws or returns a 403 response when lock-down C forbids this class. */
export async function enforceSpendLock(
  routeClass: RouteClass,
  authenticated: boolean,
  spendLock: SpendLockService | undefined,
): Promise<APIGatewayProxyResultV2 | null> {
  if (!spendLock) {
    return null;
  }
  const active = await spendLock.isActive();
  if (!active) {
    return null;
  }
  if (routeClass === 'health' || routeClass === 'sign-in' || routeClass === 'refresh') {
    return null;
  }
  if (routeClass === 'register') {
    return spendLockResponse();
  }
  if (routeClass === 'expensive') {
    return spendLockResponse();
  }
  if (routeClass === 'invite-admin') {
    return null;
  }
  if (!authenticated && routeClass === 'ordinary') {
    return null;
  }
  return null;
}

export function assertNotSpendLocked(active: boolean, blocked: boolean): void {
  if (active && blocked) {
    throw new ForbiddenError(
      'Cloud spend lock-down is active; try again next billing period.',
      'SPEND_LOCK',
    );
  }
}
