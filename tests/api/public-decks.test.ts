import { describe, expect, it } from 'vitest';
import { handleAuthSignIn } from '../../packages/api/src/handlers/auth-sign-in.ts';
import { handleDeck } from '../../packages/api/src/handlers/decks.ts';
import { handlePublicUserDeck } from '../../packages/api/src/handlers/public-decks.ts';
import { encodeTestJwt } from '../../packages/api/src/lib/jwt.ts';
import { createMemoryStores, TEST_AUTH_HEADERS } from './helpers/test-services.ts';
import commander from '../fixtures/deck-builder/commander-slice.json';

describe('public user deck GET', () => {
  it('returns a Rayenz deck by slug without auth after sign-in backfill', async () => {
    const { services } = createMemoryStores();
    const signIn = await handleAuthSignIn(
      {},
      JSON.stringify({ username: 'Rayenz', password: 'test-password-1' }),
      services,
    );
    expect(signIn.statusCode).toBe(200);
    const tokens = JSON.parse(String(signIn.body)) as { accessToken: string };
    const put = await handleDeck(
      'PUT',
      'cmd-fixture',
      { authorization: `Bearer ${tokens.accessToken}` },
      JSON.stringify(commander),
      services,
    );
    expect(put.statusCode).toBe(200);

    const pub = await handlePublicUserDeck('rayenz', 'fixture-commander', {}, services);
    expect(pub.statusCode).toBe(200);
    expect(JSON.parse(String(pub.body)).name).toBe(commander.name);
  });

  it('returns 404 for unknown user, sandbox, and missing deck', async () => {
    const { services } = createMemoryStores();
    await handleAuthSignIn(
      {},
      JSON.stringify({ username: 'Rayenz', password: 'test-password-1' }),
      services,
    );

    const unknown = await handlePublicUserDeck('nobody', 'fixture-commander', {}, services);
    expect(unknown.statusCode).toBe(404);

    const sandbox = await handlePublicUserDeck('sandbox', 'fixture-commander', {}, services);
    expect(sandbox.statusCode).toBe(404);

    const missing = await handlePublicUserDeck('rayenz', 'no-such-deck', {}, services);
    expect(missing.statusCode).toBe(404);
  });

  it('does not expose another partition via public slug', async () => {
    const { services } = createMemoryStores();
    await handleDeck('PUT', 'cmd-fixture', TEST_AUTH_HEADERS, JSON.stringify(commander), services);
    await handleAuthSignIn(
      {},
      JSON.stringify({ username: 'Rayenz', password: 'test-password-1' }),
      services,
    );

    const pub = await handlePublicUserDeck('rayenz', 'fixture-commander', {}, services);
    expect(pub.statusCode).toBe(404);

    const ownerGet = await handleDeck('GET', 'cmd-fixture', TEST_AUTH_HEADERS, null, services);
    expect(ownerGet.statusCode).toBe(200);
  });

  it('keeps owner PUT on the JWT partition', async () => {
    const { services } = createMemoryStores();
    const friendHeaders = {
      authorization: `Bearer ${encodeTestJwt({ sub: 'friend-sub', username: 'friend' })}`,
    };
    await handleDeck('PUT', 'cmd-fixture', friendHeaders, JSON.stringify(commander), services);
    await handleAuthSignIn(
      {},
      JSON.stringify({ username: 'Rayenz', password: 'test-password-1' }),
      services,
    );
    const pub = await handlePublicUserDeck('rayenz', 'fixture-commander', {}, services);
    expect(pub.statusCode).toBe(404);
  });
});
