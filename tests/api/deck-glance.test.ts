import { describe, expect, it } from 'vitest';
import { GLANCE_GENERATION_VERSION } from '@rayenz-hub/shared';
import { handleDeck } from '../../packages/api/src/handlers/decks.ts';
import { handleDeckGlance } from '../../packages/api/src/handlers/deck-glance.ts';
import { TEST_AUTH_HEADERS } from './helpers/test-services.ts';
import { withGlanceBlobStore } from './helpers/glance-render.ts';
import {
  buildEligibleCommanderDeck,
  buildMultiLieutenantCommanderDeck,
} from '../fixtures/deck-builder/glance-eligible.ts';

describe('deck glance API', () => {
  it('returns 404 for unknown deckId', async () => {
    const { services, renderOptions } = withGlanceBlobStore();
    const res = await handleDeckGlance('missing', TEST_AUTH_HEADERS, null, services, renderOptions);
    expect(res.statusCode).toBe(404);
  });

  it('returns PNG for under-count decks padded with placeholders', async () => {
    const { services, renderOptions } = withGlanceBlobStore();
    const deck = buildEligibleCommanderDeck({ deckId: 'too-small' });
    deck.cards = deck.cards.slice(0, 10);
    await handleDeck('PUT', 'too-small', TEST_AUTH_HEADERS, JSON.stringify(deck), services);
    const res = await handleDeckGlance('too-small', TEST_AUTH_HEADERS, null, services, renderOptions);
    expect(res.statusCode).toBe(200);
    expect(res.headers?.['content-type']).toBe('image/png');
    expect(res.headers?.['x-glance-generation']).toBe(GLANCE_GENERATION_VERSION);
  });

  it('returns 400 GLANCE_NOT_ELIGIBLE for over-count decks', async () => {
    const { services, renderOptions } = withGlanceBlobStore();
    const base = buildEligibleCommanderDeck({ deckId: 'too-big' });
    base.cards = [
      ...base.cards,
      {
        ...base.cards[0]!,
        instanceId: 'extra-over',
        name: 'Extra Over Card',
        collectorNumber: '9999',
      },
    ];
    await handleDeck('PUT', 'too-big', TEST_AUTH_HEADERS, JSON.stringify(base), services);
    const res = await handleDeckGlance('too-big', TEST_AUTH_HEADERS, null, services, renderOptions);
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(String(res.body)).code).toBe('GLANCE_NOT_ELIGIBLE');
  });

  it('returns PNG bytes and cache HIT on second call', async () => {
    const { services, renderOptions } = withGlanceBlobStore();
    const deck = buildEligibleCommanderDeck();
    await handleDeck('PUT', deck.deckId, TEST_AUTH_HEADERS, JSON.stringify(deck), services);

    const first = await handleDeckGlance(deck.deckId, TEST_AUTH_HEADERS, null, services, renderOptions);
    expect(first.statusCode).toBe(200);
    expect(first.headers?.['content-type']).toBe('image/png');
    expect(first.headers?.['x-glance-cache']).toBe('MISS');
    expect(first.headers?.['x-glance-generation']).toBe(GLANCE_GENERATION_VERSION);
    expect(first.isBase64Encoded).toBe(true);

    const second = await handleDeckGlance(deck.deckId, TEST_AUTH_HEADERS, null, services, renderOptions);
    expect(second.statusCode).toBe(200);
    expect(second.headers?.['x-glance-cache']).toBe('HIT');
    expect(second.body).toBe(first.body);
  });

  it('returns identical PNG bytes for the same eligible deck on consecutive POSTs', async () => {
    const { services, renderOptions } = withGlanceBlobStore();
    const deck = buildEligibleCommanderDeck({ deckId: 'glance-determinism' });
    await handleDeck('PUT', deck.deckId, TEST_AUTH_HEADERS, JSON.stringify(deck), services);
    const first = await handleDeckGlance(deck.deckId, TEST_AUTH_HEADERS, null, services, renderOptions);
    const second = await handleDeckGlance(deck.deckId, TEST_AUTH_HEADERS, null, services, renderOptions);
    expect(first.body).toBe(second.body);
  });

  it('caches each lieutenant highlight selection separately', async () => {
    const { services, renderOptions } = withGlanceBlobStore();
    const deck = buildMultiLieutenantCommanderDeck(4, { deckId: 'glance-lts' });
    await handleDeck('PUT', deck.deckId, TEST_AUTH_HEADERS, JSON.stringify(deck), services);
    const glance = (ids: string[]) =>
      handleDeckGlance(
        deck.deckId,
        TEST_AUTH_HEADERS,
        JSON.stringify({ lieutenantInstanceIds: ids }),
        services,
        renderOptions,
      );

    const first = await glance(['spell-0', 'spell-1']);
    expect(first.statusCode).toBe(200);
    expect(first.headers?.['x-glance-cache']).toBe('MISS');

    const other = await glance(['spell-2', 'spell-3']);
    expect(other.statusCode).toBe(200);
    expect(other.headers?.['x-glance-cache']).toBe('MISS');

    const repeat = await glance(['spell-0', 'spell-1']);
    expect(repeat.headers?.['x-glance-cache']).toBe('HIT');
  });

  it('rejects malformed bodies and unknown lieutenant ids', async () => {
    const { services, renderOptions } = withGlanceBlobStore();
    const deck = buildMultiLieutenantCommanderDeck(4, { deckId: 'glance-lts-bad' });
    await handleDeck('PUT', deck.deckId, TEST_AUTH_HEADERS, JSON.stringify(deck), services);

    const badJson = await handleDeckGlance(deck.deckId, TEST_AUTH_HEADERS, '{oops', services, renderOptions);
    expect(badJson.statusCode).toBe(400);
    expect(JSON.parse(String(badJson.body)).code).toBe('BAD_REQUEST');

    const badShape = await handleDeckGlance(
      deck.deckId,
      TEST_AUTH_HEADERS,
      JSON.stringify({ lieutenantInstanceIds: [7] }),
      services,
      renderOptions,
    );
    expect(badShape.statusCode).toBe(400);
    expect(JSON.parse(String(badShape.body)).code).toBe('BAD_REQUEST');

    const unknownId = await handleDeckGlance(
      deck.deckId,
      TEST_AUTH_HEADERS,
      JSON.stringify({ lieutenantInstanceIds: ['spell-40'] }),
      services,
      renderOptions,
    );
    expect(unknownId.statusCode).toBe(400);
    expect(JSON.parse(String(unknownId.body)).code).toBe('GLANCE_INVALID_LIEUTENANTS');
  });

  it('returns presigned JSON when PNG exceeds inline limit', async () => {
    const { services, renderOptions } = withGlanceBlobStore();
    const deck = buildEligibleCommanderDeck({ deckId: 'glance-presigned' });
    await handleDeck('PUT', deck.deckId, TEST_AUTH_HEADERS, JSON.stringify(deck), services);
    const res = await handleDeckGlance(deck.deckId, TEST_AUTH_HEADERS, null, services, {
      ...renderOptions,
      inlineMaxBytes: 1,
      presignGet: async () => ({
        url: 'https://example.test/glance.png',
        expiresAt: '2026-07-23T00:00:00.000Z',
      }),
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers?.['content-type']).toBe('application/json');
    const body = JSON.parse(String(res.body));
    expect(body.delivery).toBe('presigned');
    expect(body.url).toBe('https://example.test/glance.png');
    expect(body.generation).toBe(GLANCE_GENERATION_VERSION);
    expect(body.cache).toBe('MISS');
  });
});
