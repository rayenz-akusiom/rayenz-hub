import type { AuthContext } from '@rayenz-hub/shared';

export interface ApiEnv {
  HUB_API_KEY?: string;
  HUB_USER_ID?: string;
  HUB_TABLE_NAME?: string;
  DYNAMODB_ENDPOINT?: string;
  AWS_REGION?: string;
}

export function readEnv(): ApiEnv {
  return {
    HUB_API_KEY: process.env.HUB_API_KEY,
    HUB_USER_ID: process.env.HUB_USER_ID,
    HUB_TABLE_NAME: process.env.HUB_TABLE_NAME || 'HubTable',
    DYNAMODB_ENDPOINT: process.env.DYNAMODB_ENDPOINT,
    AWS_REGION: process.env.AWS_REGION || 'us-east-1',
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
  if (!expected || token !== expected) {
    return { type: 'api-key', validated: false };
  }
  return { type: 'api-key', validated: true };
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
