import crypto from 'node:crypto';
import {
  AdminCreateUserCommand,
  AdminGetUserCommand,
  AdminSetUserPasswordCommand,
  ChangePasswordCommand,
  CodeMismatchException,
  CognitoIdentityProviderClient,
  ConfirmSignUpCommand,
  ExpiredCodeException,
  GlobalSignOutCommand,
  InitiateAuthCommand,
  InvalidPasswordException,
  LimitExceededException,
  NotAuthorizedException,
  ResendConfirmationCodeCommand,
  SignUpCommand,
  UsernameExistsException,
  UserNotFoundException,
} from '@aws-sdk/client-cognito-identity-provider';
import { normalizeUsername, type AuthTokensResponse } from '@rayenz-hub/shared';
import { AuthError, BadRequestError, ConflictError, TooManyRequestsError, type ApiEnv } from '../lib/auth.js';
import { encodeTestJwt } from '../lib/jwt.js';

export const MEMORY_CONFIRMATION_CODE = '123456';

export interface CognitoAuthPort {
  initiateAuth(username: string, password: string): Promise<AuthTokensResponse>;
  refresh(refreshToken: string, username?: string): Promise<AuthTokensResponse>;
  globalSignOut(accessToken: string): Promise<void>;
  changePassword(accessToken: string, previousPassword: string, proposedPassword: string): Promise<void>;
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

function payloadFromAccessToken(accessToken: string): { sub: string; username: string } {
  const parts = accessToken.split('.');
  if (parts.length !== 3) {
    return { sub: '', username: '' };
  }
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as {
      sub?: string;
      username?: string;
      'cognito:username'?: string;
    };
    return {
      sub: payload.sub || '',
      username: payload['cognito:username'] || payload.username || '',
    };
  } catch {
    return { sub: '', username: '' };
  }
}

function subFromAccessToken(accessToken: string): string {
  return payloadFromAccessToken(accessToken).sub;
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
    const normalized = normalizeUsername(username);
    try {
      const out = await this.client.send(
        new InitiateAuthCommand({
          AuthFlow: 'USER_PASSWORD_AUTH',
          ClientId: clientId,
          AuthParameters: {
            USERNAME: normalized,
            PASSWORD: password,
            ...this.hash(normalized, clientId, clientSecret),
          },
        }),
      );
      const access = out.AuthenticationResult?.AccessToken || '';
      return tokensFromAuthResult(out.AuthenticationResult, normalized, subFromAccessToken(access));
    } catch {
      throw new AuthError();
    }
  }

  async refresh(refreshToken: string, username?: string): Promise<AuthTokensResponse> {
    const { clientId, clientSecret } = this.requirePool();
    const normalized = username ? normalizeUsername(username) : '';
    try {
      const params: Record<string, string> = { REFRESH_TOKEN: refreshToken };
      if (normalized && clientSecret) {
        Object.assign(params, this.hash(normalized, clientId, clientSecret));
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
      return tokensFromAuthResult(out.AuthenticationResult, normalized, sub);
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

  async changePassword(accessToken: string, previousPassword: string, proposedPassword: string): Promise<void> {
    try {
      await this.client.send(
        new ChangePasswordCommand({
          AccessToken: accessToken,
          PreviousPassword: previousPassword,
          ProposedPassword: proposedPassword,
        }),
      );
    } catch (err) {
      if (err instanceof InvalidPasswordException) {
        throw new BadRequestError('Password does not meet requirements');
      }
      if (err instanceof NotAuthorizedException) {
        throw new BadRequestError('Current password is incorrect');
      }
      if (err instanceof LimitExceededException) {
        throw new TooManyRequestsError();
      }
      throw err;
    }
  }

  async signUp(username: string, password: string, email: string): Promise<{ sub: string; username: string }> {
    const { clientId, clientSecret } = this.requirePool();
    const normalized = normalizeUsername(username);
    try {
      const out = await this.client.send(
        new SignUpCommand({
          ClientId: clientId,
          Username: normalized,
          Password: password,
          UserAttributes: [{ Name: 'email', Value: email }],
          SecretHash: clientSecret ? secretHash(normalized, clientId, clientSecret) : undefined,
        }),
      );
      const sub = out.UserSub || '';
      if (!sub) {
        throw new Error('Cognito SignUp returned no sub');
      }
      return { sub, username: normalized };
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
    const normalized = normalizeUsername(username);
    try {
      await this.client.send(
        new ConfirmSignUpCommand({
          ClientId: clientId,
          Username: normalized,
          ConfirmationCode: code,
          SecretHash: clientSecret ? secretHash(normalized, clientId, clientSecret) : undefined,
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
    const normalized = normalizeUsername(username);
    try {
      await this.client.send(
        new ResendConfirmationCodeCommand({
          ClientId: clientId,
          Username: normalized,
          SecretHash: clientSecret ? secretHash(normalized, clientId, clientSecret) : undefined,
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
    const normalized = normalizeUsername(username);
    try {
      const created = await this.client.send(
        new AdminCreateUserCommand({
          UserPoolId: poolId,
          Username: normalized,
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
          Username: normalized,
          Password: password,
          Permanent: true,
        }),
      );
      const sub =
        created.User?.Attributes?.find((a) => a.Name === 'sub')?.Value ||
        (await this.findUser(normalized))?.sub ||
        '';
      if (!sub) {
        throw new Error('Cognito user created without sub');
      }
      return { sub, username: normalized };
    } catch (err) {
      if (err instanceof UsernameExistsException) {
        throw new ConflictError('Username is not available');
      }
      throw err;
    }
  }

  async findUser(username: string): Promise<{ sub: string; username: string } | null> {
    const { poolId } = this.requirePool();
    const normalized = normalizeUsername(username);
    try {
      const out = await this.client.send(
        new AdminGetUserCommand({ UserPoolId: poolId, Username: normalized }),
      );
      const sub = out.UserAttributes?.find((a) => a.Name === 'sub')?.Value || '';
      return { sub, username: normalizeUsername(out.Username || normalized) };
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
      const username = normalizeUsername(u.username);
      this.users.set(username, {
        sub: u.sub,
        password: u.password,
        email: u.email || `${username}@example.test`,
        confirmed: true,
      });
    }
  }

  async initiateAuth(username: string, password: string): Promise<AuthTokensResponse> {
    const key = normalizeUsername(username);
    const user = this.users.get(key);
    if (!user || user.password !== password || !user.confirmed) {
      throw new AuthError();
    }
    return this.issue(key, user.sub);
  }

  async refresh(refreshToken: string): Promise<AuthTokensResponse> {
    const decoded = Buffer.from(refreshToken, 'base64url').toString('utf8');
    const [rawUsername, sub] = decoded.split(':');
    const username = normalizeUsername(rawUsername || '');
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

  async changePassword(accessToken: string, previousPassword: string, proposedPassword: string): Promise<void> {
    const username = normalizeUsername(payloadFromAccessToken(accessToken).username);
    const user = username ? this.users.get(username) : undefined;
    if (!user || user.password !== previousPassword) {
      throw new BadRequestError('Current password is incorrect');
    }
    user.password = proposedPassword;
  }

  async signUp(username: string, password: string, email: string): Promise<{ sub: string; username: string }> {
    const key = normalizeUsername(username);
    if (this.users.has(key)) {
      throw new ConflictError('Username is not available');
    }
    const sub = crypto.randomUUID();
    this.users.set(key, { sub, password, email, confirmed: false });
    return { sub, username: key };
  }

  async confirmSignUp(username: string, code: string): Promise<void> {
    const user = this.users.get(normalizeUsername(username));
    if (!user || user.confirmed) {
      throw new AuthError();
    }
    if (code !== MEMORY_CONFIRMATION_CODE) {
      throw new BadRequestError('Invalid or expired confirmation code');
    }
    user.confirmed = true;
  }

  async resendConfirmationCode(username: string): Promise<void> {
    const user = this.users.get(normalizeUsername(username));
    if (!user || user.confirmed) {
      throw new AuthError();
    }
  }

  async adminCreateUser(username: string, password: string, email: string): Promise<{ sub: string; username: string }> {
    const key = normalizeUsername(username);
    if (this.users.has(key)) {
      throw new ConflictError('Username is not available');
    }
    const sub = crypto.randomUUID();
    this.users.set(key, { sub, password, email, confirmed: true });
    return { sub, username: key };
  }

  async findUser(username: string): Promise<{ sub: string; username: string } | null> {
    const key = normalizeUsername(username);
    const user = this.users.get(key);
    if (!user) {
      return null;
    }
    return { sub: user.sub, username: key };
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
