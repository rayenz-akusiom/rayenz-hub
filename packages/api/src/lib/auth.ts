import type { AuthContext } from '@rayenz-hub/shared';
import { looksLikeJwt, verifyBearerJwt } from './jwt.js';

export interface ApiEnv {
  HUB_API_KEY?: string;
  HUB_USER_ID?: string;
  HUB_TABLE_NAME?: string;
  HUB_BUCKET_NAME?: string;
  DYNAMODB_ENDPOINT?: string;
  S3_ENDPOINT?: string;
  AWS_REGION?: string;
  COGNITO_USER_POOL_ID?: string;
  COGNITO_CLIENT_ID?: string;
  COGNITO_CLIENT_SECRET?: string;
  HUB_OWNER_USERNAME?: string;
  HUB_OWNER_SUB?: string;
  HUB_JWT_TEST_MODE?: string;
  HUB_INVITE_SECRET?: string;
  HUB_PAGES_ORIGIN?: string;
}

export function readEnv(): ApiEnv {
  return {
    HUB_API_KEY: process.env.HUB_API_KEY,
    HUB_USER_ID: process.env.HUB_USER_ID,
    HUB_TABLE_NAME: process.env.HUB_TABLE_NAME || 'HubTable',
    HUB_BUCKET_NAME: process.env.HUB_BUCKET_NAME || 'rayenz-hub-data-local',
    DYNAMODB_ENDPOINT: process.env.DYNAMODB_ENDPOINT,
    S3_ENDPOINT: process.env.S3_ENDPOINT,
    AWS_REGION: process.env.AWS_REGION || 'us-east-1',
    COGNITO_USER_POOL_ID: process.env.COGNITO_USER_POOL_ID,
    COGNITO_CLIENT_ID: process.env.COGNITO_CLIENT_ID,
    COGNITO_CLIENT_SECRET: process.env.COGNITO_CLIENT_SECRET,
    HUB_OWNER_USERNAME: process.env.HUB_OWNER_USERNAME || 'Rayenz',
    HUB_OWNER_SUB: process.env.HUB_OWNER_SUB,
    HUB_JWT_TEST_MODE: process.env.HUB_JWT_TEST_MODE,
    HUB_INVITE_SECRET: process.env.HUB_INVITE_SECRET,
    HUB_PAGES_ORIGIN: process.env.HUB_PAGES_ORIGIN || 'https://rayenz-akusiom.github.io/rayenz-akusiom',
  };
}

export function parseAuthContext(headers: Record<string, string | undefined>, env: ApiEnv): AuthContext {
  const authHeader = headers.authorization || headers.Authorization;
  if (!authHeader) {
    return { type: 'none', validated: false };
  }
  const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  if (!match) {
    return { type: 'none', validated: false };
  }
  const token = match[1];
  const expected = env.HUB_API_KEY;
  if (expected && token === expected) {
    return {
      type: 'api-key',
      validated: true,
      username: env.HUB_OWNER_USERNAME || 'Rayenz',
      sub: env.HUB_USER_ID,
    };
  }
  if (looksLikeJwt(token)) {
    return { type: 'jwt', validated: false };
  }
  return { type: 'api-key', validated: false };
}

export async function parseAuthContextAsync(
  headers: Record<string, string | undefined>,
  env: ApiEnv,
): Promise<AuthContext> {
  const sync = parseAuthContext(headers, env);
  if (sync.validated || sync.type !== 'jwt') {
    return sync;
  }
  const authHeader = headers.authorization || headers.Authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  if (!match) {
    return { type: 'none', validated: false };
  }
  return verifyBearerJwt(match[1], env);
}

export function requireAuth(auth: AuthContext): void {
  if (!auth.validated) {
    throw new AuthError();
  }
}

export class AuthError extends Error {
  readonly statusCode = 401;

  constructor() {
    super('Unauthorized');
    this.name = 'AuthError';
  }
}

export class NotFoundError extends Error {
  readonly statusCode = 404;

  constructor(message = 'Not found') {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class BadRequestError extends Error {
  readonly statusCode = 400;

  constructor(message: string) {
    super(message);
    this.name = 'BadRequestError';
  }
}

export class ConflictError extends Error {
  readonly statusCode = 409;

  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

export class ForbiddenError extends Error {
  readonly statusCode = 403;
  readonly code: string;

  constructor(message: string, code = 'FORBIDDEN') {
    super(message);
    this.name = 'ForbiddenError';
    this.code = code;
  }
}

export class TooManyRequestsError extends Error {
  readonly statusCode = 429;

  constructor(message = 'Too many requests') {
    super(message);
    this.name = 'TooManyRequestsError';
  }
}
