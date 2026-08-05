import { describe, expect, it } from 'vitest';
import { SWAP_GLANCE_GENERATION_VERSION } from '@rayenz-hub/shared';
import { handleDeck } from '../../packages/api/src/handlers/decks.ts';
import { handleSwapsGlance } from '../../packages/api/src/handlers/swaps-glance.ts';
import { TEST_AUTH_HEADERS } from './helpers/test-services.ts';
import {
  expectCacheHit,
  expectPngMiss,
  glanceErrorCode,
  withGlanceBlobStore,
} from './helpers/glance-render.ts';
import { buildGlanceSwapCommanderDeck } from '../fixtures/deck-builder/glance-eligible.ts';

describe('swaps glance API', () => {
  it('returns 400 for invalid body', async () => {
    const { services, renderOptions } = withGlanceBlobStore();
    const badJson = await handleSwapsGlance(TEST_AUTH_HEADERS, '{oops', services, renderOptions);
    expect(badJson.statusCode).toBe(400);

    const badShape = await handleSwapsGlance(
      TEST_AUTH_HEADERS,
      JSON.stringify({ mode: 'nope', includeSeeking: true, items: [] }),
      services,
      renderOptions,
    );
    expect(badShape.statusCode).toBe(400);
  });

  it('returns 404 when a referenced deck is missing', async () => {
    const { services, renderOptions } = withGlanceBlobStore();
    const res = await handleSwapsGlance(
      TEST_AUTH_HEADERS,
      JSON.stringify({
        mode: 'in_only',
        includeSeeking: false,
        items: [{ deckId: 'missing', kind: 'queued_in', entryId: 'e1' }],
      }),
      services,
      renderOptions,
    );
    expect(res.statusCode).toBe(404);
  });

  it('returns PNG bytes and cache HIT on second call', async () => {
    const { services, renderOptions } = withGlanceBlobStore();
    const deck = buildGlanceSwapCommanderDeck({ deckId: 'swap-glance-1' });
    await handleDeck('PUT', deck.deckId, TEST_AUTH_HEADERS, JSON.stringify(deck), services);
    const body = JSON.stringify({
      mode: 'full',
      includeSeeking: false,
      items: [{ deckId: deck.deckId, kind: 'queued_in', entryId: 'swap-1' }],
    });

    const first = await handleSwapsGlance(TEST_AUTH_HEADERS, body, services, renderOptions);
    expectPngMiss(first, SWAP_GLANCE_GENERATION_VERSION);

    const second = await handleSwapsGlance(TEST_AUTH_HEADERS, body, services, renderOptions);
    expectCacheHit(second, first);
  });

  it('accepts setCodes and uses a distinct cache key from no-filter', async () => {
    const { services, renderOptions } = withGlanceBlobStore();
    const deck = buildGlanceSwapCommanderDeck({ deckId: 'swap-glance-sets' });
    await handleDeck('PUT', deck.deckId, TEST_AUTH_HEADERS, JSON.stringify(deck), services);
    const items = [{ deckId: deck.deckId, kind: 'queued_in', entryId: 'swap-1' }];

    const plain = await handleSwapsGlance(
      TEST_AUTH_HEADERS,
      JSON.stringify({ mode: 'full', includeSeeking: false, items }),
      services,
      renderOptions,
    );
    expect(plain.statusCode).toBe(200);

    const filtered = await handleSwapsGlance(
      TEST_AUTH_HEADERS,
      JSON.stringify({
        mode: 'full',
        includeSeeking: false,
        setCodes: ['mh3', 'msc'],
        items,
      }),
      services,
      renderOptions,
    );
    expect(filtered.statusCode).toBe(200);
    expect(filtered.headers?.['x-glance-generation']).toBe(SWAP_GLANCE_GENERATION_VERSION);
    expect(filtered.headers?.['x-glance-cache']).toBe('MISS');
    expect(filtered.body).not.toBe(plain.body);
  });

  it('returns 400 SWAP_GLANCE_EMPTY when entry cannot be resolved', async () => {
    const { services, renderOptions } = withGlanceBlobStore();
    const deck = buildGlanceSwapCommanderDeck({ deckId: 'swap-glance-empty' });
    await handleDeck('PUT', deck.deckId, TEST_AUTH_HEADERS, JSON.stringify(deck), services);
    const res = await handleSwapsGlance(
      TEST_AUTH_HEADERS,
      JSON.stringify({
        mode: 'in_only',
        includeSeeking: false,
        items: [{ deckId: deck.deckId, kind: 'queued_in', entryId: 'nope' }],
      }),
      services,
      renderOptions,
    );
    expect(res.statusCode).toBe(400);
    expect(glanceErrorCode(res)).toBe('SWAP_GLANCE_EMPTY');
  });
});
