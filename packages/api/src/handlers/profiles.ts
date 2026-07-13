import { ProfileUpsertSchema } from '@rayenz-hub/shared';
import { errorResponse, jsonResponse } from '../lib/response.js';
import { authErrorResponse, withAuth } from '../lib/request-auth.js';
import { createDocClient } from '../repositories/settings-repository.js';
import { createS3Client, S3BlobStore } from '../repositories/s3-blob-store.js';
import { ProfileRepository } from '../repositories/profile-repository.js';

export async function handleListProfiles(
  headers: Record<string, string | undefined>,
  deps?: { profileRepo?: ProfileRepository },
) {
  try {
    const { auth, env } = withAuth(headers);
    const repo = deps?.profileRepo ?? buildProfileRepo(env);
    const profiles = await repo.list(auth, env);
    return jsonResponse(200, { profiles });
  } catch (e) {
    const authErr = safeAuthError(e);
    if (authErr) {
      return errorResponse(authErr.statusCode, authErr.body.error, authErr.body.code);
    }
    throw e;
  }
}

export async function handleProfile(
  method: string,
  deckId: string,
  headers: Record<string, string | undefined>,
  body: string | null | undefined,
  deps?: { profileRepo?: ProfileRepository },
) {
  try {
    const { auth, env } = withAuth(headers);
    const repo = deps?.profileRepo ?? buildProfileRepo(env);

    if (method === 'GET') {
      const record = await repo.get(auth, env, deckId);
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
      const result = ProfileUpsertSchema.safeParse(parsed);
      if (!result.success) {
        return errorResponse(400, 'Invalid request body', 'BAD_REQUEST');
      }
      const saved = await repo.put(auth, env, deckId, result.data);
      return jsonResponse(200, saved);
    }

    return errorResponse(405, 'Method not allowed', 'METHOD_NOT_ALLOWED');
  } catch (e) {
    const authErr = safeAuthError(e);
    if (authErr) {
      return errorResponse(authErr.statusCode, authErr.body.error, authErr.body.code);
    }
    throw e;
  }
}

function buildProfileRepo(env: ReturnType<typeof withAuth>['env']) {
  const doc = createDocClient(env);
  const s3 = new S3BlobStore(createS3Client(env), env.HUB_BUCKET_NAME || 'rayenz-hub-data-local');
  return new ProfileRepository(doc, env.HUB_TABLE_NAME || 'HubTable', s3);
}

function safeAuthError(e: unknown) {
  try {
    return authErrorResponse(e);
  } catch {
    return null;
  }
}
