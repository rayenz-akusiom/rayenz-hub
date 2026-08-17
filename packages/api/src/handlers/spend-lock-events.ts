import type { SNSEvent, EventBridgeEvent } from 'aws-lambda';
import { createDocClient } from '../repositories/settings-repository.js';
import { SpendLockService } from '../services/spend-lock.js';
import { readEnv } from '../lib/auth.js';

type SpendLockAction = 'set' | 'clear';

function periodKeyNow(date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function parseSpendLockAction(payload: unknown): SpendLockAction {
  if (payload && typeof payload === 'object') {
    const obj = payload as { action?: string; AlarmName?: string; notificationType?: string; message?: string };
    if (obj.action === 'clear' || obj.action === 'period_start') return 'clear';
    if (obj.action === 'set') return 'set';
    const blob = JSON.stringify(payload);
    if (/period_start|NEW_FISCAL|budget.*ok/i.test(blob)) return 'clear';
    if (/"Threshold"\s*:\s*95/i.test(blob) || /95\s*%/i.test(blob) || /budget_95/i.test(blob)) {
      return 'set';
    }
  }
  return 'set';
}

export async function handler(
  event: SNSEvent | EventBridgeEvent<string, Record<string, unknown>> | { action?: string },
): Promise<{ ok: true; action: SpendLockAction; periodKey: string }> {
  const env = readEnv();
  const spendLock = new SpendLockService(createDocClient(env), env.HUB_TABLE_NAME || 'HubTable');
  let payload: unknown = event;
  if (event && typeof event === 'object' && 'Records' in event && Array.isArray(event.Records)) {
    const record = event.Records[0];
    const message = record?.Sns?.Message;
    if (message) {
      try {
        payload = JSON.parse(message);
      } catch {
        payload = { message };
      }
    }
  }
  const action = parseSpendLockAction(payload);
  if (action === 'clear') {
    await spendLock.setActive(false, 'period_start');
  } else {
    await spendLock.setActive(true, 'budget_95');
  }
  return { ok: true, action, periodKey: periodKeyNow() };
}
