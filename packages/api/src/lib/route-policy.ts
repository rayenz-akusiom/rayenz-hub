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

/** Owner-only expensive routes (glance, swaps glance, suggest generate). */
export async function requireOwnerAndSpendUnlocked(
  auth: AuthContext,
  authService: { requireOwner(auth: AuthContext): void },
  spendLock: { isActive(): Promise<boolean> },
): Promise<APIGatewayProxyResultV2 | null> {
  authService.requireOwner(auth);
  if (await spendLock.isActive()) {
    return spendLockResponse();
  }
  return null;
}
