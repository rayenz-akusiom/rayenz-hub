import { afterEach, describe, expect, it } from 'vitest';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { handler } from '../../packages/api/src/handler.ts';

function apiEvent(overrides: Partial<APIGatewayProxyEventV2> & { rawPath: string; method: string }): APIGatewayProxyEventV2 {
  return {
    version: '2.0',
    routeKey: '$default',
    rawPath: overrides.rawPath,
    rawQueryString: '',
    headers: overrides.headers ?? {},
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
    body: overrides.body,
  } as APIGatewayProxyEventV2;
}

describe('GET /v1/health', () => {
  it('returns ok without authentication', async () => {
    const result = await handler(apiEvent({ rawPath: '/v1/health', method: 'GET' }));
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(String(result.body))).toEqual({ status: 'ok', version: 'v1' });
  });
});

describe('unknown routes', () => {
  afterEach(() => {
    delete process.env.HUB_API_KEY;
  });

  it('returns 404 for unmapped paths', async () => {
    process.env.HUB_API_KEY = 'test-key';
    const result = await handler(apiEvent({
      rawPath: '/v1/unknown',
      method: 'GET',
      headers: { authorization: 'Bearer test-key' },
    }));
    expect(result.statusCode).toBe(404);
  });
});
