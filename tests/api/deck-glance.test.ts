import { describe, expect, it } from 'vitest';
import { buildGlanceIncludeSet, buildGlanceLayoutPlan } from '@rayenz-hub/shared';
import { handleDeck } from '../../packages/api/src/handlers/decks.ts';
import { handleDeckGlance } from '../../packages/api/src/handlers/deck-glance.ts';
import { createMemoryStores, TEST_AUTH_HEADERS } from './helpers/test-services.ts';
import { asBlobStore } from './helpers/test-blob-store.ts';
import { buildEligibleCommanderDeck } from '../fixtures/deck-builder/glance-eligible.ts';

const TEST_CARD_IMAGE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const renderOptions = {
  skipArtEnrichment: true,
  imageLoader: async () => new Uint8Array(TEST_CARD_IMAGE),
};

describe('deck glance API', () => {
  it('returns 404 for unknown deckId', async () => {
    const { services, s3 } = createMemoryStores();
    const res = await handleDeckGlance('missing', TEST_AUTH_HEADERS, services, {
      ...renderOptions,
      blobStore: asBlobStore(s3),
    });
    expect(res.statusCode).toBe(404);
  });

  it('returns 400 GLANCE_NOT_ELIGIBLE for under-count decks', async () => {
    const { services, s3 } = createMemoryStores();
    const deck = buildEligibleCommanderDeck({ deckId: 'too-small' });
    deck.cards = deck.cards.slice(0, 10);
    await handleDeck('PUT', 'too-small', TEST_AUTH_HEADERS, JSON.stringify(deck), services);
    const res = await handleDeckGlance('too-small', TEST_AUTH_HEADERS, services, {
      ...renderOptions,
      blobStore: asBlobStore(s3),
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(String(res.body)).code).toBe('GLANCE_NOT_ELIGIBLE');
  });

  it('returns PNG bytes and cache HIT on second call', async () => {
    const { services, s3 } = createMemoryStores();
    const deck = buildEligibleCommanderDeck();
    await handleDeck('PUT', deck.deckId, TEST_AUTH_HEADERS, JSON.stringify(deck), services);

    const blob = asBlobStore(s3);
    const first = await handleDeckGlance(deck.deckId, TEST_AUTH_HEADERS, services, {
      ...renderOptions,
      blobStore: blob,
    });
    expect(first.statusCode).toBe(200);
    expect(first.headers?.['content-type']).toBe('image/png');
    expect(first.headers?.['x-glance-cache']).toBe('MISS');
    expect(first.isBase64Encoded).toBe(true);

    const second = await handleDeckGlance(deck.deckId, TEST_AUTH_HEADERS, services, {
      ...renderOptions,
      blobStore: blob,
    });
    expect(second.statusCode).toBe(200);
    expect(second.headers?.['x-glance-cache']).toBe('HIT');
    expect(second.body).toBe(first.body);
  });

  it('returns identical PNG bytes for the same eligible deck on consecutive POSTs', async () => {
    const { services, s3 } = createMemoryStores();
    const deck = buildEligibleCommanderDeck({ deckId: 'glance-determinism' });
    await handleDeck('PUT', deck.deckId, TEST_AUTH_HEADERS, JSON.stringify(deck), services);
    const blob = asBlobStore(s3);
    const opts = { ...renderOptions, blobStore: blob };
    const first = await handleDeckGlance(deck.deckId, TEST_AUTH_HEADERS, services, opts);
    const second = await handleDeckGlance(deck.deckId, TEST_AUTH_HEADERS, services, opts);
    expect(first.body).toBe(second.body);
  });

  it('sets showQuantity only on basic lands with quantity > 1 in the layout plan path', () => {
    const deck = buildEligibleCommanderDeck();
    const include = buildGlanceIncludeSet(deck);
    expect(include.ok).toBe(true);
    if (!include.ok) return;
    const plan = buildGlanceLayoutPlan(include.includeSet, deck.name);
    for (const placement of plan.placements) {
      if (placement.showQuantity) {
        expect(placement.card.isBasicLand).toBe(true);
        expect(placement.card.quantity).toBeGreaterThan(1);
      }
    }
    const forest = plan.placements.find((p) => p.card.instanceId === 'forest-stack');
    expect(forest?.showQuantity).toBe(true);
  });
});
