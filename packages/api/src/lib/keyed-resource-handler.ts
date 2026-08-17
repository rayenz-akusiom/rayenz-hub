import type { AuthContext } from '@rayenz-hub/shared';
import type { APIGatewayProxyResultV2 } from 'aws-lambda';
import type { ApiEnv } from './auth.js';
import { mapHandlerError } from './handler-errors.js';
import { errorResponse, jsonResponse } from './response.js';
import type { AuthService } from '../services/auth-service.js';

export type ParseJsonResult =
  | { ok: true; value: unknown }
  | { ok: false; response: APIGatewayProxyResultV2 };

export function parseJsonBody(body: string | null | undefined): ParseJsonResult {
  try {
    return { ok: true, value: body ? JSON.parse(body) : null };
  } catch {
    return { ok: false, response: errorResponse(400, 'Invalid JSON body', 'BAD_REQUEST') };
  }
}

type SafeParseResult<T> = { success: true; data: T } | { success: false; error: unknown };

type ZodLikeSchema<T> = {
  safeParse: (data: unknown) => SafeParseResult<T>;
};

export type KeyedResourceOps<TRecord, TUpsert> = {
  get: (auth: AuthContext, env: ApiEnv, key: string) => Promise<TRecord | null | undefined>;
  put: (auth: AuthContext, env: ApiEnv, key: string, data: TUpsert) => Promise<TRecord>;
  delete?: (auth: AuthContext, env: ApiEnv, key: string) => Promise<boolean>;
};

export type HandleKeyedResourceOptions<TRecord, TUpsert> = {
  method: string;
  key: string;
  headers: Record<string, string | undefined>;
  body: string | null | undefined;
  authService: AuthService;
  schema: ZodLikeSchema<TUpsert>;
  ops: KeyedResourceOps<TRecord, TUpsert>;
  /** When set, PUT bodies may be `{ document: ... }` and the document field is validated. */
  unwrapDocument?: boolean;
};

export async function handleKeyedResource<TRecord, TUpsert>(
  options: HandleKeyedResourceOptions<TRecord, TUpsert>,
): Promise<APIGatewayProxyResultV2> {
  const { method, key, headers, body, authService, schema, ops, unwrapDocument } = options;
  try {
    const { auth, env } = await authService.authenticate(headers);

    if (method === 'GET') {
      const record = await ops.get(auth, env, key);
      if (!record) {
        return errorResponse(404, 'Not found', 'NOT_FOUND');
      }
      return jsonResponse(200, record);
    }

    if (method === 'PUT') {
      const parsedBody = parseJsonBody(body);
      if (!parsedBody.ok) {
        return parsedBody.response;
      }
      let docBody: unknown = parsedBody.value;
      if (unwrapDocument) {
        const raw = parsedBody.value;
        docBody =
          raw && typeof raw === 'object' && raw !== null && 'document' in raw
            ? (raw as { document: unknown }).document
            : raw;
      }
      const result = schema.safeParse(docBody);
      if (!result.success) {
        return errorResponse(400, 'Invalid request body', 'BAD_REQUEST');
      }
      const saved = await ops.put(auth, env, key, result.data);
      return jsonResponse(200, saved);
    }

    if (method === 'DELETE' && ops.delete) {
      const ok = await ops.delete(auth, env, key);
      if (!ok) {
        return errorResponse(404, 'Not found', 'NOT_FOUND');
      }
      return {
        statusCode: 204,
        headers: { 'content-type': 'application/json' },
        body: '',
      };
    }

    return errorResponse(405, 'Method not allowed', 'METHOD_NOT_ALLOWED');
  } catch (e) {
    const mapped = mapHandlerError(e, authService);
    if (mapped) {
      return mapped;
    }
    throw e;
  }
}

export type HandleListResourceOptions<TItem> = {
  headers: Record<string, string | undefined>;
  authService: AuthService;
  list: (auth: AuthContext, env: ApiEnv) => Promise<TItem[]>;
  /** Response object key, e.g. `profiles` or `decks`. */
  collectionKey: string;
};

export async function handleListResource<TItem>(
  options: HandleListResourceOptions<TItem>,
): Promise<APIGatewayProxyResultV2> {
  const { headers, authService, list, collectionKey } = options;
  try {
    const { auth, env } = await authService.authenticate(headers);
    const items = await list(auth, env);
    return jsonResponse(200, { [collectionKey]: items });
  } catch (e) {
    const mapped = mapHandlerError(e, authService);
    if (mapped) {
      return mapped;
    }
    throw e;
  }
}
