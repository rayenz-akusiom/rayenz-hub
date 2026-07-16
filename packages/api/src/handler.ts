import 'reflect-metadata';
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { errorResponse } from './lib/response.js';
import { handleHealth } from './handlers/health.js';
import { handleSettings } from './handlers/settings.js';
import { handleListProfiles, handleProfile } from './handlers/profiles.js';
import { handleListDecks, handleDeck } from './handlers/decks.js';
import { handleReviewProgress } from './handlers/review-progress.js';
import { handleSetPool } from './handlers/set-pools.js';

export async function route(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  const method = event.requestContext.http.method;
  const path = event.rawPath;
  const headers = normalizeHeaders(event.headers);

  if (method === 'GET' && path === '/v1/health') {
    return handleHealth();
  }

  const settingsMatch = /^\/v1\/settings\/([^/]+)$/.exec(path);
  if (settingsMatch) {
    return handleSettings(method, decodeURIComponent(settingsMatch[1]), headers, event.body);
  }

  if (method === 'GET' && path === '/v1/profiles') {
    return handleListProfiles(headers);
  }

  const profileMatch = /^\/v1\/profiles\/([^/]+)$/.exec(path);
  if (profileMatch) {
    return handleProfile(method, decodeURIComponent(profileMatch[1]), headers, event.body);
  }

  if (method === 'GET' && path === '/v1/decks') {
    return handleListDecks(headers);
  }

  const deckMatch = /^\/v1\/decks\/([^/]+)$/.exec(path);
  if (deckMatch) {
    return handleDeck(method, decodeURIComponent(deckMatch[1]), headers, event.body);
  }

  const reviewMatch = /^\/v1\/review-progress\/([^/]+)$/.exec(path);
  if (reviewMatch) {
    return handleReviewProgress(method, decodeURIComponent(reviewMatch[1]), headers, event.body);
  }

  const setPoolMatch = /^\/v1\/set-pools\/([^/]+)$/.exec(path);
  if (setPoolMatch) {
    return handleSetPool(method, decodeURIComponent(setPoolMatch[1]), headers, event.body);
  }

  return errorResponse(404, 'Not found', 'NOT_FOUND');
}

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  try {
    return await route(event);
  } catch (err) {
    console.error(err);
    return errorResponse(500, 'Internal server error', 'INTERNAL_ERROR');
  }
}

function normalizeHeaders(headers: APIGatewayProxyEventV2['headers']): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  if (!headers) {
    return out;
  }
  for (const [key, value] of Object.entries(headers)) {
    out[key.toLowerCase()] = value;
  }
  return out;
}
