import { describe, expect, it } from 'vitest';
import { handleAuthSignIn } from '../../packages/api/src/handlers/auth-sign-in.ts';
import { handleDeck } from '../../packages/api/src/handlers/decks.ts';
import { handleProfile } from '../../packages/api/src/handlers/profiles.ts';
import {
  handlePublicUserDeck,
  handlePublicUserDeckProfile,
} from '../../packages/api/src/handlers/public-decks.ts';
import { encodeTestJwt } from '../../packages/api/src/lib/jwt.ts';
import { createMemoryStores, TEST_AUTH_HEADERS } from './helpers/test-services.ts';
import commander from '../fixtures/deck-builder/commander-slice.json';

const RAYENZ_HEADERS = {
  authorization: `Bearer ${encodeTestJwt({ sub: 'rayenz-sub', username: 'Rayenz' })}`,
};

describe('public user deck GET', () => {
  it('resolves a Rayenz deck by slug without a prior sign-in backfill', async () => {
    const { services } = createMemoryStores();
    const ownerHeaders = {
      authorization: `Bearer ${encodeTestJwt({ sub: 'rayenz-sub', username: 'Rayenz' })}`,
    };
    const put = await handleDeck(
      'PUT',
      'cmd-fixture',
      ownerHeaders,
      JSON.stringify(commander),
      services,
    );
    expect(put.statusCode).toBe(200);

    const pub = await handlePublicUserDeck('rayenz', 'fixture-commander', {}, services);
    expect(pub.statusCode).toBe(200);
    expect(JSON.parse(String(pub.body)).name).toBe(commander.name);
  });

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

  it('returns 404 for a private deck slug while owner GET still works', async () => {
    const { services } = createMemoryStores();
    const ownerHeaders = {
      authorization: `Bearer ${encodeTestJwt({ sub: 'rayenz-sub', username: 'Rayenz' })}`,
    };
    const put = await handleDeck(
      'PUT',
      'cmd-fixture',
      ownerHeaders,
      JSON.stringify({ ...commander, visibility: 'private' }),
      services,
    );
    expect(put.statusCode).toBe(200);

    const pub = await handlePublicUserDeck('rayenz', 'fixture-commander', {}, services);
    expect(pub.statusCode).toBe(404);

    const ownerGet = await handleDeck('GET', 'cmd-fixture', ownerHeaders, null, services);
    expect(ownerGet.statusCode).toBe(200);
    expect(JSON.parse(String(ownerGet.body)).visibility).toBe('private');
  });
});

describe('public user deck profile GET', () => {
  it('returns yaml for a public deck without auth', async () => {
    const { services } = createMemoryStores();
    const putDeck = await handleDeck(
      'PUT',
      'cmd-fixture',
      RAYENZ_HEADERS,
      JSON.stringify(commander),
      services,
    );
    expect(putDeck.statusCode).toBe(200);
    const putProfile = await handleProfile(
      'PUT',
      'cmd-fixture',
      RAYENZ_HEADERS,
      JSON.stringify({
        deckName: 'Fixture Commander',
        protectedCards: ['Sol Ring'],
        tags: ['aggro'],
      }),
      services,
    );
    expect(putProfile.statusCode).toBe(200);

    const pub = await handlePublicUserDeckProfile('rayenz', 'fixture-commander', {}, services);
    expect(pub.statusCode).toBe(200);
    const body = JSON.parse(String(pub.body)) as { yaml?: string; deckId?: string };
    expect(body.deckId).toBe('cmd-fixture');
    expect(body.yaml).toContain('Sol Ring');
    expect(body.yaml).toContain('aggro');
  });

  it('resolves archidekt alias profile keys', async () => {
    const { services } = createMemoryStores();
    await handleDeck('PUT', 'cmd-fixture', RAYENZ_HEADERS, JSON.stringify(commander), services);
    const putProfile = await handleProfile(
      'PUT',
      'deck-1',
      RAYENZ_HEADERS,
      JSON.stringify({ yaml: 'format: commander\ntags:\n  - tokens\n' }),
      services,
    );
    expect(putProfile.statusCode).toBe(200);

    const pub = await handlePublicUserDeckProfile('rayenz', 'fixture-commander', {}, services);
    expect(pub.statusCode).toBe(200);
    expect(JSON.parse(String(pub.body)).yaml).toContain('tokens');
  });

  it('returns 404 when the public deck has no profile', async () => {
    const { services } = createMemoryStores();
    await handleDeck('PUT', 'cmd-fixture', RAYENZ_HEADERS, JSON.stringify(commander), services);

    const pub = await handlePublicUserDeckProfile('rayenz', 'fixture-commander', {}, services);
    expect(pub.statusCode).toBe(404);
  });

  it('returns 404 for unknown user and private decks', async () => {
    const { services } = createMemoryStores();
    await handleDeck(
      'PUT',
      'cmd-fixture',
      RAYENZ_HEADERS,
      JSON.stringify({ ...commander, visibility: 'private' }),
      services,
    );
    await handleProfile(
      'PUT',
      'cmd-fixture',
      RAYENZ_HEADERS,
      JSON.stringify({ protectedCards: ['Sol Ring'] }),
      services,
    );

    const unknown = await handlePublicUserDeckProfile('nobody', 'fixture-commander', {}, services);
    expect(unknown.statusCode).toBe(404);

    const privateDeck = await handlePublicUserDeckProfile(
      'rayenz',
      'fixture-commander',
      {},
      services,
    );
    expect(privateDeck.statusCode).toBe(404);
  });

  it('does not leak another partition profile via public slug', async () => {
    const { services } = createMemoryStores();
    await handleDeck('PUT', 'cmd-fixture', TEST_AUTH_HEADERS, JSON.stringify(commander), services);
    await handleProfile(
      'PUT',
      'cmd-fixture',
      TEST_AUTH_HEADERS,
      JSON.stringify({ protectedCards: ['Sol Ring'] }),
      services,
    );
    await handleAuthSignIn(
      {},
      JSON.stringify({ username: 'Rayenz', password: 'test-password-1' }),
      services,
    );

    const pub = await handlePublicUserDeckProfile('rayenz', 'fixture-commander', {}, services);
    expect(pub.statusCode).toBe(404);

    const ownerGet = await handleProfile('GET', 'cmd-fixture', TEST_AUTH_HEADERS, null, services);
    expect(ownerGet.statusCode).toBe(200);
  });
});
