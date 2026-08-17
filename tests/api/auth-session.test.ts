import { describe, expect, it } from 'vitest';
import { handleAuthMe, handleAuthRegister, handleAuthSignIn, handleAuthSignOut } from '../../packages/api/src/handlers/auth-sign-in.ts';
import { handleSettings } from '../../packages/api/src/handlers/settings.ts';
import { encodeTestJwt } from '../../packages/api/src/lib/jwt.ts';
import { createMemoryStores, TEST_AUTH_HEADERS, testApiEnv } from './helpers/test-services.ts';
import { MemoryCognitoAuthPort } from '../../packages/api/src/services/cognito-auth.ts';
import { createTestServices } from './helpers/test-services.ts';

describe('auth session API', () => {
  it('rejects protected routes without a token', async () => {
    const { services } = createMemoryStores();
    const res = await handleSettings('GET', 'dailies', {}, null, services);
    expect(res.statusCode).toBe(401);
  });

  it('signs in Rayenz and returns tokens', async () => {
    const { services } = createMemoryStores();
    const res = await handleAuthSignIn(
      {},
      JSON.stringify({ username: 'Rayenz', password: 'test-password-1' }),
      services,
    );
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(String(res.body));
    expect(body.username).toBe('Rayenz');
    expect(body.sub).toBe('rayenz-sub');
    expect(body.accessToken).toBeTruthy();
  });

  it('denies wrong password generically', async () => {
    const { services } = createMemoryStores();
    const res = await handleAuthSignIn(
      {},
      JSON.stringify({ username: 'Rayenz', password: 'nope' }),
      services,
    );
    expect(res.statusCode).toBe(401);
  });

  it('GET /v1/auth/me works with JWT', async () => {
    const env = testApiEnv({ HUB_JWT_TEST_MODE: 'true' });
    const services = createTestServices({
      apiEnv: env,
      cognitoAuth: new MemoryCognitoAuthPort([
        { username: 'Rayenz', password: 'test-password-1', sub: 'rayenz-sub' },
      ]),
    });
    const token = encodeTestJwt({ sub: 'rayenz-sub', username: 'Rayenz' });
    const me = await handleAuthMe({ authorization: `Bearer ${token}` }, services);
    expect(me.statusCode).toBe(200);
    const body = JSON.parse(String(me.body));
    expect(body.isOwner).toBe(true);
    expect(body.sub).toBe('rayenz-sub');
  });

  it('JWT can read settings for that sub', async () => {
    const { services } = createMemoryStores();
    const token = encodeTestJwt({ sub: 'rayenz-sub', username: 'Rayenz' });
    const put = await handleSettings(
      'PUT',
      'dailies',
      { authorization: `Bearer ${token}` },
      JSON.stringify({ payload: { wishlists: [] } }),
      services,
    );
    expect(put.statusCode).toBe(200);
  });

  it('sign-out succeeds', async () => {
    const { services } = createMemoryStores();
    const res = await handleAuthSignOut(TEST_AUTH_HEADERS, services);
    expect(res.statusCode).toBe(200);
  });

  it('register without invite fails', async () => {
    const { services } = createMemoryStores();
    const res = await handleAuthRegister(
      {},
      JSON.stringify({ token: 'nope', username: 'friend', password: 'password1' }),
      services,
    );
    expect(res.statusCode).toBe(403);
  });
});
