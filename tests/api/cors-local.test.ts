import { afterEach, describe, expect, it, vi } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { handler } from '../../packages/api/src/handler.ts';
import { binaryResponse, jsonResponse } from '../../packages/api/src/lib/response.ts';

afterEach(() => {
  vi.unstubAllEnvs();
});

function apiEvent(overrides: { rawPath: string; method: string }): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: '$default',
    rawPath: overrides.rawPath,
    rawQueryString: '',
    headers: {},
    requestContext: {
      accountId: '123456789012',
      apiId: 'api-id',
      domainName: 'localhost',
      domainPrefix: 'localhost',
      http: {
        method: overrides.method,
        path: overrides.rawPath,
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'vitest',
      },
      requestId: 'req-id',
      routeKey: '$default',
      stage: '$default',
      time: '12/Jul/2026:00:00:00 +0000',
      timeEpoch: 0,
    },
    isBase64Encoded: false,
  } as APIGatewayProxyEventV2;
}

describe('local SAM CORS', () => {
  it('omits CORS headers when DynamoDB Local is not configured', async () => {
    vi.stubEnv('AWS_SAM_LOCAL', '');
    vi.stubEnv('DYNAMODB_ENDPOINT', '');
    const result = await handler(apiEvent({ rawPath: '/v1/health', method: 'GET' }));
    expect(result.headers?.['access-control-allow-origin']).toBeUndefined();
  });

  it('adds CORS headers when AWS_SAM_LOCAL is set', async () => {
    vi.stubEnv('AWS_SAM_LOCAL', 'true');
    vi.stubEnv('DYNAMODB_ENDPOINT', '');
    const result = await handler(apiEvent({ rawPath: '/v1/health', method: 'GET' }));
    expect(result.statusCode).toBe(200);
    expect(result.headers?.['access-control-allow-origin']).toBe('*');
  });

  it('adds CORS headers when DYNAMODB_ENDPOINT is set', async () => {
    vi.stubEnv('DYNAMODB_ENDPOINT', 'http://host.docker.internal:8000');
    const result = await handler(apiEvent({ rawPath: '/v1/health', method: 'GET' }));
    expect(result.statusCode).toBe(200);
    expect(result.headers?.['access-control-allow-origin']).toBe('*');
    expect(result.headers?.['access-control-allow-headers']).toMatch(/authorization/i);
    expect(result.headers?.['access-control-allow-headers']).toMatch(/accept/i);
  });

  it('answers OPTIONS with 204 and CORS locally', async () => {
    vi.stubEnv('DYNAMODB_ENDPOINT', 'http://host.docker.internal:8000');
    const result = await handler(apiEvent({ rawPath: '/v1/auth/sign-in', method: 'OPTIONS' }));
    expect(result.statusCode).toBe(204);
    expect(result.headers?.['access-control-allow-origin']).toBe('*');
    expect(result.headers?.['access-control-allow-methods']).toMatch(/POST/i);
  });

  it('adds CORS to JSON and binary responses locally', () => {
    vi.stubEnv('DYNAMODB_ENDPOINT', 'http://127.0.0.1:8000');
    expect(jsonResponse(200, { ok: true }).headers?.['access-control-allow-origin']).toBe('*');
    expect(binaryResponse(200, new Uint8Array([1]), { 'content-type': 'image/png' }).headers?.[
      'access-control-allow-origin'
    ]).toBe('*');
  });
});
