import { describe, expect, it } from 'vitest';
import { handleSuggestGenerate } from '../../packages/api/src/handlers/suggest-generate.ts';
import { handleAuthConfirm, handleAuthRegister, handleAuthSignIn } from '../../packages/api/src/handlers/auth-sign-in.ts';
import { handleSettings } from '../../packages/api/src/handlers/settings.ts';
import { handleHealth } from '../../packages/api/src/handlers/health.ts';
import { handleInvites } from '../../packages/api/src/handlers/invites.ts';
import { requireOwnerAndSpendUnlocked } from '../../packages/api/src/lib/route-policy.ts';
import { encodeTestJwt } from '../../packages/api/src/lib/jwt.ts';
import { createMemoryStores, TEST_AUTH_HEADERS } from './helpers/test-services.ts';

describe('spend lock', () => {
  it('blocks expensive and register while allowing health, sign-in, and ordinary CRUD', async () => {
    const { services } = createMemoryStores();
    await services.spendLock.setActive(true, 'budget_95');

    const health = await handleHealth();
    expect(health.statusCode).toBe(200);

    const signIn = await handleAuthSignIn(
      {},
      JSON.stringify({ username: 'Rayenz', password: 'test-password-1' }),
      services,
    );
    expect(signIn.statusCode).toBe(200);

    const register = await handleAuthRegister(
      {},
      JSON.stringify({ token: 'x', username: 'friend', email: 'friend@example.test', password: 'password1' }),
      services,
    );
    expect(register.statusCode).toBe(403);
    expect(JSON.parse(String(register.body)).error).toBe('SPEND_LOCK');

    const confirm = await handleAuthConfirm(
      {},
      JSON.stringify({ username: 'friend', code: '123456', password: 'password1' }),
      services,
    );
    expect(confirm.statusCode).toBe(403);

    const generate = await handleSuggestGenerate(
      TEST_AUTH_HEADERS,
      JSON.stringify({ deckIds: ['d1'], setCodes: ['eoe'] }),
      services,
    );
    expect(generate.statusCode).toBe(403);
    expect(JSON.parse(String(generate.body)).code).toBe('SPEND_LOCK');

    const inviteeGenerate = await handleSuggestGenerate(
      {
        authorization: `Bearer ${encodeTestJwt({ sub: 'friend-sub', username: 'friend' })}`,
      },
      JSON.stringify({ deckIds: ['d1'], setCodes: ['eoe'] }),
      services,
    );
    expect(inviteeGenerate.statusCode).toBe(403);
    expect(JSON.parse(String(inviteeGenerate.body)).code).toBe('SPEND_LOCK');

    const settings = await handleSettings(
      'PUT',
      'dailies',
      TEST_AUTH_HEADERS,
      JSON.stringify({ payload: { wishlists: [] } }),
      services,
    );
    expect(settings.statusCode).toBe(200);

    await services.spendLock.setActive(false, 'period_start');
    const generate2 = await handleSuggestGenerate(
      TEST_AUTH_HEADERS,
      JSON.stringify({ deckIds: ['d1'], setCodes: ['eoe'] }),
      services,
      {
        fetchSetCards: async () => ({
          set_codes: ['EOE'],
          primary_set_code: 'EOE',
          product_name: 'Edge of Eternities',
          sets: [],
          expected_card_count: 0,
          fetched_card_count: 0,
          cards: [],
        }),
      },
    );
    expect(generate2.statusCode).not.toBe(403);
  });

  it('unauthenticated expensive work is rejected', async () => {
    const { services } = createMemoryStores();
    const generate = await handleSuggestGenerate(
      {},
      JSON.stringify({ deckIds: ['d1'], setCodes: ['eoe'] }),
      services,
    );
    expect(generate.statusCode).toBe(401);
  });

  it('blocks invite create under lock but still lists invites', async () => {
    const { services } = createMemoryStores();
    const created = await handleInvites('POST', TEST_AUTH_HEADERS, services);
    expect(created.statusCode).toBe(200);

    await services.spendLock.setActive(true, 'budget_95');
    const blocked = await handleInvites('POST', TEST_AUTH_HEADERS, services);
    expect(blocked.statusCode).toBe(403);
    expect(JSON.parse(String(blocked.body)).code).toBe('SPEND_LOCK');

    const list = await handleInvites('GET', TEST_AUTH_HEADERS, services);
    expect(list.statusCode).toBe(200);
    expect(JSON.parse(String(list.body)).invites).toHaveLength(1);
  });

  it('requireOwnerAndSpendUnlocked rejects invitees before spend lock', async () => {
    const { services } = createMemoryStores();
    await services.spendLock.setActive(true, 'budget_95');
    const { auth } = await services.authService.authenticate({
      authorization: `Bearer ${encodeTestJwt({ sub: 'friend-sub', username: 'friend' })}`,
    });
    await expect(
      requireOwnerAndSpendUnlocked(auth, services.authService, services.spendLock),
    ).rejects.toMatchObject({ code: 'OWNER_REQUIRED' });
  });
});
