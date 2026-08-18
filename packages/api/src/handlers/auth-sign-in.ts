import {
  AuthMeResponseSchema,
  ConfirmRequestSchema,
  RefreshRequestSchema,
  RegisterPendingResponseSchema,
  RegisterRequestSchema,
  ResendConfirmationRequestSchema,
  SignInRequestSchema,
  isReservedUsername,
  isSandboxUsername,
  resolveUserId,
} from '@rayenz-hub/shared';
import { AuthError, ForbiddenError } from '../lib/auth.js';
import { parseJsonBody } from '../lib/keyed-resource-handler.js';
import { mapHandlerError } from '../lib/handler-errors.js';
import { errorResponse, jsonResponse } from '../lib/response.js';
import { spendLockResponse } from '../lib/route-policy.js';
import { clientIp } from '../services/rate-limit.js';
import { getAppServices, type AppServices } from '../ioc/index.js';

function bearerToken(headers: Record<string, string | undefined>): string {
  const header = headers.authorization || headers.Authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1] || '';
}

export async function handleAuthSignIn(
  headers: Record<string, string | undefined>,
  body: string | null | undefined,
  services: AppServices = getAppServices(),
) {
  try {
    await services.rateLimit.consume('signin', clientIp(headers));
    const parsedBody = parseJsonBody(body);
    if (!parsedBody.ok) return parsedBody.response;
    const parsed = SignInRequestSchema.safeParse(parsedBody.value);
    if (!parsed.success) {
      return errorResponse(400, 'Invalid request body', 'BAD_REQUEST');
    }
    if (isSandboxUsername(parsed.data.username)) {
      throw new AuthError();
    }
    const tokens = await services.cognitoAuth.initiateAuth(parsed.data.username, parsed.data.password);
    try {
      await services.usernameDirectory.upsert(tokens.username || parsed.data.username, tokens.sub);
    } catch {
      /* directory backfill must not block sign-in */
    }
    return jsonResponse(200, tokens);
  } catch (e) {
    const mapped = mapHandlerError(e, services.authService);
    if (mapped) return mapped;
    throw e;
  }
}

export async function handleAuthRefresh(
  headers: Record<string, string | undefined>,
  body: string | null | undefined,
  services: AppServices = getAppServices(),
) {
  try {
    const parsedBody = parseJsonBody(body);
    if (!parsedBody.ok) return parsedBody.response;
    const parsed = RefreshRequestSchema.safeParse(parsedBody.value);
    if (!parsed.success) {
      return errorResponse(400, 'Invalid request body', 'BAD_REQUEST');
    }
    if (parsed.data.username && isSandboxUsername(parsed.data.username)) {
      throw new AuthError();
    }
    const tokens = await services.cognitoAuth.refresh(parsed.data.refreshToken, parsed.data.username);
    try {
      if (tokens.username && tokens.sub) {
        await services.usernameDirectory.upsert(tokens.username, tokens.sub);
      }
    } catch {
      /* directory backfill must not block refresh */
    }
    return jsonResponse(200, tokens);
  } catch (e) {
    const mapped = mapHandlerError(e, services.authService);
    if (mapped) return mapped;
    throw e;
  }
}

export async function handleAuthSignOut(
  headers: Record<string, string | undefined>,
  services: AppServices = getAppServices(),
) {
  try {
    const token = bearerToken(headers);
    if (token) {
      await services.cognitoAuth.globalSignOut(token);
    }
    return jsonResponse(200, { ok: true });
  } catch (e) {
    const mapped = mapHandlerError(e, services.authService);
    if (mapped) return mapped;
    throw e;
  }
}

export async function handleAuthMe(
  headers: Record<string, string | undefined>,
  services: AppServices = getAppServices(),
) {
  try {
    const { auth, env } = await services.authService.authenticate(headers);
    const sub = resolveUserId(auth, env);
    const username = auth.username || '';
    if (username && sub) {
      await services.usernameDirectory.upsert(username, sub);
    }
    return jsonResponse(
      200,
      AuthMeResponseSchema.parse({
        username,
        sub,
        isOwner: services.authService.isOwner(auth),
      }),
    );
  } catch (e) {
    const mapped = mapHandlerError(e, services.authService);
    if (mapped) return mapped;
    throw e;
  }
}

export async function handleAuthRegister(
  headers: Record<string, string | undefined>,
  body: string | null | undefined,
  services: AppServices = getAppServices(),
) {
  try {
    if (await services.spendLock.isActive()) {
      return spendLockResponse();
    }
    await services.rateLimit.consume('register', clientIp(headers));
    const parsedBody = parseJsonBody(body);
    if (!parsedBody.ok) return parsedBody.response;
    const parsed = RegisterRequestSchema.safeParse(parsedBody.value);
    if (!parsed.success) {
      return errorResponse(400, 'Invalid request body', 'BAD_REQUEST');
    }
    if (isReservedUsername(parsed.data.username)) {
      return errorResponse(400, 'Username is reserved', 'BAD_REQUEST');
    }
    const invite = await services.inviteService.redeem(parsed.data.token);
    const existing = await services.cognitoAuth.findUser(parsed.data.username);
    if (existing) {
      throw new ForbiddenError('Registration failed', 'INVITE_INVALID');
    }
    const created = await services.cognitoAuth.signUp(
      parsed.data.username,
      parsed.data.password,
      parsed.data.email,
    );
    await services.inviteService.markUsed(invite, created.sub);
    await services.usernameDirectory.upsert(created.username, created.sub);
    return jsonResponse(201, RegisterPendingResponseSchema.parse({ status: 'CONFIRM_EMAIL', username: created.username }));
  } catch (e) {
    const mapped = mapHandlerError(e, services.authService);
    if (mapped) return mapped;
    throw e;
  }
}

export async function handleAuthConfirm(
  headers: Record<string, string | undefined>,
  body: string | null | undefined,
  services: AppServices = getAppServices(),
) {
  try {
    if (await services.spendLock.isActive()) {
      return spendLockResponse();
    }
    await services.rateLimit.consume('register', clientIp(headers));
    const parsedBody = parseJsonBody(body);
    if (!parsedBody.ok) return parsedBody.response;
    const parsed = ConfirmRequestSchema.safeParse(parsedBody.value);
    if (!parsed.success) {
      return errorResponse(400, 'Invalid request body', 'BAD_REQUEST');
    }
    await services.cognitoAuth.confirmSignUp(parsed.data.username, parsed.data.code);
    const tokens = await services.cognitoAuth.initiateAuth(parsed.data.username, parsed.data.password);
    try {
      await services.usernameDirectory.upsert(tokens.username || parsed.data.username, tokens.sub);
    } catch {
      /* directory backfill must not block confirm */
    }
    return jsonResponse(200, tokens);
  } catch (e) {
    const mapped = mapHandlerError(e, services.authService);
    if (mapped) return mapped;
    throw e;
  }
}

export async function handleAuthResendConfirmation(
  headers: Record<string, string | undefined>,
  body: string | null | undefined,
  services: AppServices = getAppServices(),
) {
  try {
    if (await services.spendLock.isActive()) {
      return spendLockResponse();
    }
    await services.rateLimit.consume('register', clientIp(headers));
    const parsedBody = parseJsonBody(body);
    if (!parsedBody.ok) return parsedBody.response;
    const parsed = ResendConfirmationRequestSchema.safeParse(parsedBody.value);
    if (!parsed.success) {
      return errorResponse(400, 'Invalid request body', 'BAD_REQUEST');
    }
    await services.cognitoAuth.resendConfirmationCode(parsed.data.username);
    return jsonResponse(200, { ok: true });
  } catch (e) {
    const mapped = mapHandlerError(e, services.authService);
    if (mapped) return mapped;
    throw e;
  }
}
