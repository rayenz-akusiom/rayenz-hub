import { describe, expect, it } from 'vitest';
import { handleAuthRegister } from '../../packages/api/src/handlers/auth-sign-in.ts';
import { handleInviteRevoke, handleInvites } from '../../packages/api/src/handlers/invites.ts';
import { handleListDecks } from '../../packages/api/src/handlers/decks.ts';
import { encodeTestJwt } from '../../packages/api/src/lib/jwt.ts';
import { createMemoryStores, TEST_AUTH_HEADERS } from './helpers/test-services.ts';

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

    const registered = await handleAuthRegister(
      {},
      JSON.stringify({ token, username: 'friend', password: 'password1' }),
      services,
    );
    expect(registered.statusCode).toBe(200);
    const friend = JSON.parse(String(registered.body));
    const friendDecks = await handleListDecks(
      { authorization: `Bearer ${encodeTestJwt({ sub: friend.sub, username: 'friend' })}` },
      services,
    );
    expect(friendDecks.statusCode).toBe(200);
    expect(JSON.parse(String(friendDecks.body)).decks).toEqual([]);

    const reused = await handleAuthRegister(
      {},
      JSON.stringify({ token, username: 'other', password: 'password1' }),
      services,
    );
    expect(reused.statusCode).toBe(403);
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
    const taken = await handleAuthRegister(
      {},
      JSON.stringify({ token, username: 'Rayenz', password: 'password1' }),
      services,
    );
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
    const redeem = await handleAuthRegister(
      {},
      JSON.stringify({ token, username: 'friend', password: 'password1' }),
      services,
    );
    expect(redeem.statusCode).toBe(403);
  });
});
