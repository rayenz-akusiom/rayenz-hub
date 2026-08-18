import crypto from 'node:crypto';
import {
  AdminCreateUserCommand,
  AdminGetUserCommand,
  AdminSetUserPasswordCommand,
  CodeMismatchException,
  CognitoIdentityProviderClient,
  ConfirmSignUpCommand,
  ExpiredCodeException,
  GlobalSignOutCommand,
  InitiateAuthCommand,
  InvalidPasswordException,
  NotAuthorizedException,
  ResendConfirmationCodeCommand,
  SignUpCommand,
  UsernameExistsException,
  UserNotFoundException,
} from '@aws-sdk/client-cognito-identity-provider';
import type { AuthTokensResponse } from '@rayenz-hub/shared';
import { AuthError, BadRequestError, ConflictError, type ApiEnv } from '../lib/auth.js';
import { encodeTestJwt } from '../lib/jwt.js';

export const MEMORY_CONFIRMATION_CODE = '123456';

export interface CognitoAuthPort {
  initiateAuth(username: string, password: string): Promise<AuthTokensResponse>;
  refresh(refreshToken: string, username?: string): Promise<AuthTokensResponse>;
  globalSignOut(accessToken: string): Promise<void>;
  signUp(username: string, password: string, email: string): Promise<{ sub: string; username: string }>;
  confirmSignUp(username: string, code: string): Promise<void>;
  resendConfirmationCode(username: string): Promise<void>;
  adminCreateUser(username: string, password: string, email: string): Promise<{ sub: string; username: string }>;
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

  async signUp(username: string, password: string, email: string): Promise<{ sub: string; username: string }> {
    const { clientId, clientSecret } = this.requirePool();
    try {
      const out = await this.client.send(
        new SignUpCommand({
          ClientId: clientId,
          Username: username,
          Password: password,
          UserAttributes: [{ Name: 'email', Value: email }],
          SecretHash: clientSecret ? secretHash(username, clientId, clientSecret) : undefined,
        }),
      );
      const sub = out.UserSub || '';
      if (!sub) {
        throw new Error('Cognito SignUp returned no sub');
      }
      return { sub, username };
    } catch (err) {
      if (err instanceof UsernameExistsException) {
        throw new ConflictError('Username is not available');
      }
      if (err instanceof InvalidPasswordException) {
        throw new BadRequestError('Password does not meet requirements');
      }
      throw err;
    }
  }

  async confirmSignUp(username: string, code: string): Promise<void> {
    const { clientId, clientSecret } = this.requirePool();
    try {
      await this.client.send(
        new ConfirmSignUpCommand({
          ClientId: clientId,
          Username: username,
          ConfirmationCode: code,
          SecretHash: clientSecret ? secretHash(username, clientId, clientSecret) : undefined,
        }),
      );
    } catch (err) {
      if (err instanceof CodeMismatchException || err instanceof ExpiredCodeException) {
        throw new BadRequestError('Invalid or expired confirmation code');
      }
      if (err instanceof NotAuthorizedException || err instanceof UserNotFoundException) {
        throw new AuthError();
      }
      throw err;
    }
  }

  async resendConfirmationCode(username: string): Promise<void> {
    const { clientId, clientSecret } = this.requirePool();
    try {
      await this.client.send(
        new ResendConfirmationCodeCommand({
          ClientId: clientId,
          Username: username,
          SecretHash: clientSecret ? secretHash(username, clientId, clientSecret) : undefined,
        }),
      );
    } catch (err) {
      if (err instanceof UserNotFoundException || err instanceof NotAuthorizedException) {
        throw new AuthError();
      }
      throw err;
    }
  }

  async adminCreateUser(username: string, password: string, email: string): Promise<{ sub: string; username: string }> {
    const { poolId } = this.requirePool();
    try {
      const created = await this.client.send(
        new AdminCreateUserCommand({
          UserPoolId: poolId,
          Username: username,
          MessageAction: 'SUPPRESS',
          TemporaryPassword: password,
          UserAttributes: [
            { Name: 'email', Value: email },
            { Name: 'email_verified', Value: 'true' },
          ],
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

type MemoryUser = { sub: string; password: string; email: string; confirmed: boolean };

/** In-memory Cognito stand-in for tests and optional JWT test mode. */
export class MemoryCognitoAuthPort implements CognitoAuthPort {
  private readonly users = new Map<string, MemoryUser>();

  constructor(seed: Array<{ username: string; password: string; sub: string; email?: string }> = []) {
    for (const u of seed) {
      this.users.set(u.username, {
        sub: u.sub,
        password: u.password,
        email: u.email || `${u.username.toLowerCase()}@example.test`,
        confirmed: true,
      });
    }
  }

  async initiateAuth(username: string, password: string): Promise<AuthTokensResponse> {
    const user = this.users.get(username);
    if (!user || user.password !== password || !user.confirmed) {
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
    const user = this.users.get(username);
    if (!user?.confirmed) {
      throw new AuthError();
    }
    return this.issue(username, sub);
  }

  async globalSignOut(): Promise<void> {
    /* no-op */
  }

  async signUp(username: string, password: string, email: string): Promise<{ sub: string; username: string }> {
    if (this.users.has(username)) {
      throw new ConflictError('Username is not available');
    }
    const sub = crypto.randomUUID();
    this.users.set(username, { sub, password, email, confirmed: false });
    return { sub, username };
  }

  async confirmSignUp(username: string, code: string): Promise<void> {
    const user = this.users.get(username);
    if (!user || user.confirmed) {
      throw new AuthError();
    }
    if (code !== MEMORY_CONFIRMATION_CODE) {
      throw new BadRequestError('Invalid or expired confirmation code');
    }
    user.confirmed = true;
  }

  async resendConfirmationCode(username: string): Promise<void> {
    const user = this.users.get(username);
    if (!user || user.confirmed) {
      throw new AuthError();
    }
  }

  async adminCreateUser(username: string, password: string, email: string): Promise<{ sub: string; username: string }> {
    if (this.users.has(username)) {
      throw new ConflictError('Username is not available');
    }
    const sub = crypto.randomUUID();
    this.users.set(username, { sub, password, email, confirmed: true });
    return { sub, username };
  }

  async findUser(username: string): Promise<{ sub: string; username: string } | null> {
    const exact = this.users.get(username);
    if (exact) {
      return { sub: exact.sub, username };
    }
    const needle = username.toLowerCase();
    for (const [stored, user] of this.users) {
      if (stored.toLowerCase() === needle) {
        return { sub: user.sub, username: stored };
      }
    }
    return null;
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
