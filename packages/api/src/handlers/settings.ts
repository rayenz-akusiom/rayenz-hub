import { SettingsUpsertSchema } from '@rayenz-hub/shared';
import { errorResponse, jsonResponse } from '../lib/response.js';
import {
  AuthError,
  BadRequestError,
  NotFoundError,
  parseAuthContext,
  readEnv,
  requireAuth,
} from '../lib/auth.js';
import { createDocClient, SettingsRepository } from '../repositories/settings-repository.js';

export async function handleSettings(
  method: string,
  domain: string,
  headers: Record<string, string | undefined>,
  body: string | null | undefined,
  deps?: {
    settingsRepo?: SettingsRepository;
  },
) {
  const env = readEnv();
  const auth = parseAuthContext(headers, env);
  try {
    requireAuth(auth);
  } catch (e) {
    if (e instanceof AuthError) {
      return errorResponse(401, 'Unauthorized', 'UNAUTHORIZED');
    }
    throw e;
  }

  const doc = createDocClient(env);
  const repo = deps?.settingsRepo ?? new SettingsRepository(doc, env.HUB_TABLE_NAME || 'HubTable');

  if (method === 'GET') {
    try {
      const record = await repo.get(auth, env, domain);
      if (!record) {
        return errorResponse(404, 'Not found', 'NOT_FOUND');
      }
      return jsonResponse(200, record);
    } catch (e) {
      if (e instanceof NotFoundError) {
        return errorResponse(404, e.message, 'NOT_FOUND');
      }
      throw e;
    }
  }

  if (method === 'PUT') {
    let parsed: unknown;
    try {
      parsed = body ? JSON.parse(body) : null;
    } catch {
      return errorResponse(400, 'Invalid JSON body', 'BAD_REQUEST');
    }
    const result = SettingsUpsertSchema.safeParse(parsed);
    if (!result.success) {
      return errorResponse(400, 'Invalid request body', 'BAD_REQUEST');
    }
    try {
      const saved = await repo.put(auth, env, domain, result.data);
      return jsonResponse(200, saved);
    } catch (e) {
      if (e instanceof BadRequestError) {
        return errorResponse(400, e.message, 'BAD_REQUEST');
      }
      if ((e as Error).message === 'Invalid domain') {
        return errorResponse(400, 'Invalid settings domain', 'BAD_REQUEST');
      }
      throw e;
    }
  }

  return errorResponse(405, 'Method not allowed', 'METHOD_NOT_ALLOWED');
}
