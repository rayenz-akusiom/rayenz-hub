import { SetPoolUpsertSchema } from '@rayenz-hub/shared';
import { errorResponse, jsonResponse } from '../lib/response.js';
import { authErrorResponse, withAuth } from '../lib/request-auth.js';
import { createDocClient } from '../repositories/settings-repository.js';
import { createS3Client, S3BlobStore } from '../repositories/s3-blob-store.js';
import { SetPoolRepository } from '../repositories/set-pool-repository.js';

export async function handleSetPool(
  method: string,
  codesKey: string,
  headers: Record<string, string | undefined>,
  body: string | null | undefined,
  deps?: { setPoolRepo?: SetPoolRepository },
) {
  try {
    const { auth, env } = withAuth(headers);
    const repo = deps?.setPoolRepo ?? buildSetPoolRepo(env);

    if (method === 'GET') {
      const record = await repo.get(auth, env, codesKey);
      if (!record) {
        return errorResponse(404, 'Not found', 'NOT_FOUND');
      }
      return jsonResponse(200, record);
    }

    if (method === 'PUT') {
      let parsed: unknown;
      try {
        parsed = body ? JSON.parse(body) : null;
      } catch {
        return errorResponse(400, 'Invalid JSON body', 'BAD_REQUEST');
      }
      const result = SetPoolUpsertSchema.safeParse(parsed);
      if (!result.success) {
        return errorResponse(400, 'Invalid request body', 'BAD_REQUEST');
      }
      const saved = await repo.put(auth, env, codesKey, result.data);
      return jsonResponse(200, saved);
    }

    return errorResponse(405, 'Method not allowed', 'METHOD_NOT_ALLOWED');
  } catch (e) {
    try {
      const authErr = authErrorResponse(e);
      return errorResponse(authErr.statusCode, authErr.body.error, authErr.body.code);
    } catch {
      throw e;
    }
  }
}

function buildSetPoolRepo(env: ReturnType<typeof withAuth>['env']) {
  const doc = createDocClient(env);
  const s3 = new S3BlobStore(createS3Client(env), env.HUB_BUCKET_NAME || 'rayenz-hub-data-local');
  return new SetPoolRepository(doc, env.HUB_TABLE_NAME || 'HubTable', s3);
}
