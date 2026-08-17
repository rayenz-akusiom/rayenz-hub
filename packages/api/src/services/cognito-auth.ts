import crypto from 'node:crypto';
import {
  AdminCreateUserCommand,
  AdminGetUserCommand,
  AdminSetUserPasswordCommand,
  CognitoIdentityProviderClient,
  GlobalSignOutCommand,
  InitiateAuthCommand,
  UsernameExistsException,
  UserNotFoundException,
} from '@aws-sdk/client-cognito-identity-provider';
import type { AuthTokensResponse } from '@rayenz-hub/shared';
import { AuthError, BadRequestError, ConflictError, type ApiEnv } from '../lib/auth.js';
import { encodeTestJwt } from '../lib/jwt.js';

export interface CognitoAuthPort {
  initiateAuth(username: string, password: string): Promise<AuthTokensResponse>;
  refresh(refreshToken: string, username?: string): Promise<AuthTokensResponse>;
  globalSignOut(accessToken: string): Promise<void>;
  adminCreateUser(username: string, password: string): Promise<{ sub: string; username: string }>;
  findUser(username: string): Promise<{ sub: string; username: string } | null>;
}

function secretHash(username: string, clientId: string, clientSecret: string): string {
  return crypto.createHmac('sha256', clientSecret).update(username + clientId).digest('base64');
}

function tokensFromAuthResult(
  result: {
    AccessToken?: string;
    IdToken?: string;
    RefreshToken?: string;
    ExpiresIn?: number;
  } | undefined,
  username: string,
  sub: string,
): AuthTokensResponse {
  if (!result?.AccessToken) {
    throw new AuthError();
  }
  return {
    accessToken: result.AccessToken,
    idToken: result.IdToken,
    refreshToken: result.RefreshToken,
    expiresIn: result.ExpiresIn || 3600,
    username,
    sub,
  };
}

function subFromAccessToken(accessToken: string): string {
  const parts = accessToken.split('.');
  if (parts.length !== 3) {
    return '';
  }
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as { sub?: string };
    return payload.sub || '';
  } catch {
    return '';
  }
}

export class AwsCognitoAuthPort implements CognitoAuthPort {
  private readonly client: CognitoIdentityProviderClient;

  constructor(private readonly env: ApiEnv) {
    this.client = new CognitoIdentityProviderClient({ region: env.AWS_REGION || 'us-east-1' });
  }

  private requirePool(): { poolId: string; clientId: string; clientSecret?: string } {
    const poolId = this.env.COGNITO_USER_POOL_ID?.trim();
    const clientId = this.env.COGNITO_CLIENT_ID?.trim();
    if (!poolId || !clientId) {
      throw new BadRequestError('Cognito is not configured on this API');
    }
    return { poolId, clientId, clientSecret: this.env.COGNITO_CLIENT_SECRET };
  }

  private hash(username: string, clientId: string, clientSecret?: string): Record<string, string> {
    if (!clientSecret) {
      return {};
    }
    return { SECRET_HASH: secretHash(username, clientId, clientSecret) };
  }

  async initiateAuth(username: string, password: string): Promise<AuthTokensResponse> {
    const { clientId, clientSecret } = this.requirePool();
    try {
      const out = await this.client.send(
        new InitiateAuthCommand({
          AuthFlow: 'USER_PASSWORD_AUTH',
          ClientId: clientId,
          AuthParameters: {
            USERNAME: username,
            PASSWORD: password,
            ...this.hash(username, clientId, clientSecret),
          },
        }),
      );
      const access = out.AuthenticationResult?.AccessToken || '';
      return tokensFromAuthResult(out.AuthenticationResult, username, subFromAccessToken(access));
    } catch {
      throw new AuthError();
    }
  }

  async refresh(refreshToken: string, username?: string): Promise<AuthTokensResponse> {
    const { clientId, clientSecret } = this.requirePool();
    try {
      const params: Record<string, string> = { REFRESH_TOKEN: refreshToken };
      if (username && clientSecret) {
        Object.assign(params, this.hash(username, clientId, clientSecret));
      }
      const out = await this.client.send(
        new InitiateAuthCommand({
          AuthFlow: 'REFRESH_TOKEN_AUTH',
          ClientId: clientId,
          AuthParameters: params,
        }),
      );
      const access = out.AuthenticationResult?.AccessToken || '';
      const sub = subFromAccessToken(access);
      return tokensFromAuthResult(out.AuthenticationResult, username || '', sub);
    } catch {
      throw new AuthError();
    }
  }

  async globalSignOut(accessToken: string): Promise<void> {
    try {
      await this.client.send(new GlobalSignOutCommand({ AccessToken: accessToken }));
    } catch {
      /* best-effort */
    }
  }

  async adminCreateUser(username: string, password: string): Promise<{ sub: string; username: string }> {
    const { poolId } = this.requirePool();
    try {
      const created = await this.client.send(
        new AdminCreateUserCommand({
          UserPoolId: poolId,
          Username: username,
          MessageAction: 'SUPPRESS',
          TemporaryPassword: password,
        }),
      );
      await this.client.send(
        new AdminSetUserPasswordCommand({
          UserPoolId: poolId,
          Username: username,
          Password: password,
          Permanent: true,
        }),
      );
      const sub =
        created.User?.Attributes?.find((a) => a.Name === 'sub')?.Value ||
        (await this.findUser(username))?.sub ||
        '';
      if (!sub) {
        throw new Error('Cognito user created without sub');
      }
      return { sub, username };
    } catch (err) {
      if (err instanceof UsernameExistsException) {
        throw new ConflictError('Username is not available');
      }
      throw err;
    }
  }

  async findUser(username: string): Promise<{ sub: string; username: string } | null> {
    const { poolId } = this.requirePool();
    try {
      const out = await this.client.send(
        new AdminGetUserCommand({ UserPoolId: poolId, Username: username }),
      );
      const sub = out.UserAttributes?.find((a) => a.Name === 'sub')?.Value || '';
      return { sub, username: out.Username || username };
    } catch (err) {
      if (err instanceof UserNotFoundException) {
        return null;
      }
      throw err;
    }
  }
}

/** In-memory Cognito stand-in for tests and optional JWT test mode. */
export class MemoryCognitoAuthPort implements CognitoAuthPort {
  private readonly users = new Map<string, { sub: string; password: string }>();

  constructor(seed: Array<{ username: string; password: string; sub: string }> = []) {
    for (const u of seed) {
      this.users.set(u.username, { sub: u.sub, password: u.password });
    }
  }

  async initiateAuth(username: string, password: string): Promise<AuthTokensResponse> {
    const user = this.users.get(username);
    if (!user || user.password !== password) {
      throw new AuthError();
    }
    return this.issue(username, user.sub);
  }

  async refresh(refreshToken: string): Promise<AuthTokensResponse> {
    const decoded = Buffer.from(refreshToken, 'base64url').toString('utf8');
    const [username, sub] = decoded.split(':');
    if (!username || !this.users.has(username)) {
      throw new AuthError();
    }
    return this.issue(username, sub);
  }

  async globalSignOut(): Promise<void> {
    /* no-op */
  }

  async adminCreateUser(username: string, password: string): Promise<{ sub: string; username: string }> {
    if (this.users.has(username)) {
      throw new ConflictError('Username is not available');
    }
    const sub = crypto.randomUUID();
    this.users.set(username, { sub, password });
    return { sub, username };
  }

  async findUser(username: string): Promise<{ sub: string; username: string } | null> {
    const user = this.users.get(username);
    return user ? { sub: user.sub, username } : null;
  }

  private issue(username: string, sub: string): AuthTokensResponse {
    return {
      accessToken: encodeTestJwt({ sub, username }),
      idToken: encodeTestJwt({ sub, username }),
      refreshToken: Buffer.from(`${username}:${sub}`).toString('base64url'),
      expiresIn: 3600,
      username,
      sub,
    };
  }
}

export function createCognitoAuthPort(env: ApiEnv, override?: CognitoAuthPort): CognitoAuthPort {
  if (override) {
    return override;
  }
  if (env.HUB_JWT_TEST_MODE === 'true' || env.HUB_JWT_TEST_MODE === '1') {
    return new MemoryCognitoAuthPort();
  }
  return new AwsCognitoAuthPort(env);
}
