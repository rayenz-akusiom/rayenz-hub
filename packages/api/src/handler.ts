import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { errorResponse } from './lib/response.js';
import { handleHealth } from './handlers/health.js';
import { handleSettings } from './handlers/settings.js';

export async function route(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  const method = event.requestContext.http.method;
  const path = event.rawPath;

  if (method === 'GET' && path === '/v1/health') {
    return handleHealth();
  }

  const settingsMatch = /^\/v1\/settings\/([^/]+)$/.exec(path);
  if (settingsMatch) {
    return handleSettings(
      method,
      decodeURIComponent(settingsMatch[1]),
      normalizeHeaders(event.headers),
      event.body,
    );
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
