import { describe, expect, it } from 'vitest';
import {
  handleAuthConfirm,
  handleAuthRegister,
  handleAuthResendConfirmation,
  handleAuthSignIn,
} from '../../packages/api/src/handlers/auth-sign-in.ts';
import { handleInviteRevoke, handleInvites } from '../../packages/api/src/handlers/invites.ts';
import { handleListDecks } from '../../packages/api/src/handlers/decks.ts';
import { encodeTestJwt } from '../../packages/api/src/lib/jwt.ts';
import { MEMORY_CONFIRMATION_CODE } from '../../packages/api/src/services/cognito-auth.ts';
import { createMemoryStores, TEST_AUTH_HEADERS } from './helpers/test-services.ts';

function registerBody(token: string, username: string, email = `${username}@example.test`) {
  return JSON.stringify({ token, username, email, password: 'password1' });
}

describe('invites API', () => {
  it('owner creates, lists, copies, and invitee registers isolated', async () => {
    const { services } = createMemoryStores();
    const created = await handleInvites('POST', TEST_AUTH_HEADERS, services);
    expect(created.statusCode).toBe(200);
    const invite = JSON.parse(String(created.body)) as { inviteId: string; url: string };
    expect(invite.url).toContain('#/invite/');
    const token = decodeURIComponent(invite.url.split('#/invite/')[1]);

    const list = await handleInvites('GET', TEST_AUTH_HEADERS, services);
    expect(JSON.parse(String(list.body)).invites[0].status).toBe('unused');

    const registered = await handleAuthRegister({}, registerBody(token, 'friend'), services);
    expect(registered.statusCode).toBe(201);
    expect(JSON.parse(String(registered.body))).toEqual({ status: 'CONFIRM_EMAIL', username: 'friend' });

    const beforeConfirm = await handleAuthSignIn(
      {},
      JSON.stringify({ username: 'friend', password: 'password1' }),
      services,
    );
    expect(beforeConfirm.statusCode).toBe(401);

    const used = await handleInvites('GET', TEST_AUTH_HEADERS, services);
    expect(JSON.parse(String(used.body)).invites[0].status).toBe('used');

    const confirmed = await handleAuthConfirm(
      {},
      JSON.stringify({ username: 'friend', code: MEMORY_CONFIRMATION_CODE, password: 'password1' }),
      services,
    );
    expect(confirmed.statusCode).toBe(200);
    const friend = JSON.parse(String(confirmed.body));
    expect(friend.accessToken).toBeTruthy();
    const friendDecks = await handleListDecks(
      { authorization: `Bearer ${encodeTestJwt({ sub: friend.sub, username: 'friend' })}` },
      services,
    );
    expect(friendDecks.statusCode).toBe(200);
    expect(JSON.parse(String(friendDecks.body)).decks).toEqual([]);

    const reused = await handleAuthRegister({}, registerBody(token, 'other'), services);
    expect(reused.statusCode).toBe(403);
  });

  it('rejects a wrong confirmation code', async () => {
    const { services } = createMemoryStores();
    const created = await handleInvites('POST', TEST_AUTH_HEADERS, services);
    const invite = JSON.parse(String(created.body)) as { url: string };
    const token = decodeURIComponent(invite.url.split('#/invite/')[1]);
    await handleAuthRegister({}, registerBody(token, 'friend'), services);
    const wrong = await handleAuthConfirm(
      {},
      JSON.stringify({ username: 'friend', code: '000000', password: 'password1' }),
      services,
    );
    expect(wrong.statusCode).toBe(400);
  });

  it('resends confirmation for a pending user', async () => {
    const { services } = createMemoryStores();
    const created = await handleInvites('POST', TEST_AUTH_HEADERS, services);
    const invite = JSON.parse(String(created.body)) as { url: string };
    const token = decodeURIComponent(invite.url.split('#/invite/')[1]);
    await handleAuthRegister({}, registerBody(token, 'friend'), services);
    const resent = await handleAuthResendConfirmation({}, JSON.stringify({ username: 'friend' }), services);
    expect(resent.statusCode).toBe(200);
  });

  it('non-owner cannot create invites', async () => {
    const { services } = createMemoryStores();
    const res = await handleInvites(
      'POST',
      { authorization: `Bearer ${encodeTestJwt({ sub: 'other-sub', username: 'friend' })}` },
      services,
    );
    expect(res.statusCode).toBe(403);
  });

  it('taken username leaves invite unused', async () => {
    const { services } = createMemoryStores();
    const created = await handleInvites('POST', TEST_AUTH_HEADERS, services);
    const invite = JSON.parse(String(created.body)) as { url: string };
    const token = decodeURIComponent(invite.url.split('#/invite/')[1]);
    const taken = await handleAuthRegister({}, registerBody(token, 'Rayenz'), services);
    expect(taken.statusCode).toBe(403);
    const list = await handleInvites('GET', TEST_AUTH_HEADERS, services);
    expect(JSON.parse(String(list.body)).invites[0].status).toBe('unused');
  });

  it('revoke stops redeem', async () => {
    const { services } = createMemoryStores();
    const created = await handleInvites('POST', TEST_AUTH_HEADERS, services);
    const invite = JSON.parse(String(created.body)) as { inviteId: string; url: string };
    const token = decodeURIComponent(invite.url.split('#/invite/')[1]);
    const revoked = await handleInviteRevoke(invite.inviteId, TEST_AUTH_HEADERS, services);
    expect(revoked.statusCode).toBe(200);
    const redeem = await handleAuthRegister({}, registerBody(token, 'friend'), services);
    expect(redeem.statusCode).toBe(403);
  });
});
