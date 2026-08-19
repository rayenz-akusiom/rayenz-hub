import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import type { AuthContext } from '@rayenz-hub/shared';
import { jsonResponse } from './response.js';

export function spendLockResponse(): APIGatewayProxyResultV2 {
  return jsonResponse(403, {
    error: 'SPEND_LOCK',
    message: 'Cloud spend lock-down is active; try again next billing period.',
    code: 'SPEND_LOCK',
  });
}

/** Spend-locked expensive routes (suggest generate). Auth is required by the handler. */
export async function requireSpendUnlocked(
  spendLock: { isActive(): Promise<boolean> },
): Promise<APIGatewayProxyResultV2 | null> {
  if (await spendLock.isActive()) {
    return spendLockResponse();
  }
  return null;
}

/** Owner-only expensive routes (glance, swaps glance). */
export async function requireOwnerAndSpendUnlocked(
  auth: AuthContext,
  authService: { requireOwner(auth: AuthContext): void },
  spendLock: { isActive(): Promise<boolean> },
): Promise<APIGatewayProxyResultV2 | null> {
  authService.requireOwner(auth);
  return requireSpendUnlocked(spendLock);
}
