import 'reflect-metadata';
import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { errorResponse, optionsResponse } from './lib/response.js';
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

  if (method === 'OPTIONS') {
    return optionsResponse();
  }

  if (method === 'POST' && path === '/v1/auth/sign-in') {
    const { handleAuthSignIn } = await import('./handlers/auth-sign-in.js');
    return handleAuthSignIn(headers, event.body);
  }
  if (method === 'POST' && path === '/v1/auth/register') {
    const { handleAuthRegister } = await import('./handlers/auth-sign-in.js');
    return handleAuthRegister(headers, event.body);
  }
  if (method === 'POST' && path === '/v1/auth/confirm') {
    const { handleAuthConfirm } = await import('./handlers/auth-sign-in.js');
    return handleAuthConfirm(headers, event.body);
  }
  if (method === 'POST' && path === '/v1/auth/resend-confirmation') {
    const { handleAuthResendConfirmation } = await import('./handlers/auth-sign-in.js');
    return handleAuthResendConfirmation(headers, event.body);
  }
  if (method === 'POST' && path === '/v1/auth/refresh') {
    const { handleAuthRefresh } = await import('./handlers/auth-sign-in.js');
    return handleAuthRefresh(headers, event.body);
  }
  if (method === 'POST' && path === '/v1/auth/sign-out') {
    const { handleAuthSignOut } = await import('./handlers/auth-sign-in.js');
    return handleAuthSignOut(headers);
  }
  if (method === 'GET' && path === '/v1/auth/me') {
    const { handleAuthMe } = await import('./handlers/auth-sign-in.js');
    return handleAuthMe(headers);
  }
  if (path === '/v1/invites' && (method === 'GET' || method === 'POST')) {
    const { handleInvites } = await import('./handlers/invites.js');
    return handleInvites(method, headers);
  }
  const inviteRevoke = /^\/v1\/invites\/([^/]+)\/revoke$/.exec(path);
  if (inviteRevoke && method === 'POST') {
    const { handleInviteRevoke } = await import('./handlers/invites.js');
    return handleInviteRevoke(decodeURIComponent(inviteRevoke[1]), headers);
  }

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

  const publicSwapsMatch = /^\/v1\/users\/([^/]+)\/swaps$/.exec(path);
  if (publicSwapsMatch && method === 'GET') {
    const { handlePublicUserSwaps } = await import('./handlers/public-swaps.js');
    return handlePublicUserSwaps(decodeURIComponent(publicSwapsMatch[1]), headers);
  }

  const publicDeckProfileMatch = /^\/v1\/users\/([^/]+)\/decks\/([^/]+)\/profile$/.exec(path);
  if (publicDeckProfileMatch && method === 'GET') {
    const { handlePublicUserDeckProfile } = await import('./handlers/public-decks.js');
    return handlePublicUserDeckProfile(
      decodeURIComponent(publicDeckProfileMatch[1]),
      decodeURIComponent(publicDeckProfileMatch[2]),
      headers,
    );
  }

  const publicDeckMatch = /^\/v1\/users\/([^/]+)\/decks\/([^/]+)$/.exec(path);
  if (publicDeckMatch && method === 'GET') {
    const { handlePublicUserDeck } = await import('./handlers/public-decks.js');
    return handlePublicUserDeck(
      decodeURIComponent(publicDeckMatch[1]),
      decodeURIComponent(publicDeckMatch[2]),
      headers,
    );
  }

  const deckMatch = /^\/v1\/decks\/([^/]+)$/.exec(path);
  if (deckMatch) {
    return handleDeck(method, decodeURIComponent(deckMatch[1]), headers, event.body);
  }

  const glanceMatch = /^\/v1\/decks\/([^/]+)\/glance$/.exec(path);
  if (glanceMatch && method === 'POST') {
    // Dynamic import keeps sharp (native) off the cold path for other routes.
    const { handleDeckGlance } = await import('./handlers/deck-glance.js');
    return handleDeckGlance(decodeURIComponent(glanceMatch[1]), headers, event.body);
  }

  if (method === 'POST' && path === '/v1/swaps/glance') {
    const { handleSwapsGlance } = await import('./handlers/swaps-glance.js');
    return handleSwapsGlance(headers, event.body);
  }

  if (method === 'GET' && path === '/v1/suggest/releases') {
    const { handleSuggestReleases } = await import('./handlers/suggest-releases.js');
    return handleSuggestReleases(headers);
  }

  if (method === 'POST' && path === '/v1/suggest/generate') {
    const { handleSuggestGenerate } = await import('./handlers/suggest-generate.js');
    return handleSuggestGenerate(headers, event.body);
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
