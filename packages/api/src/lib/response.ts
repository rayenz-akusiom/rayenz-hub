import type { APIGatewayProxyResultV2 } from 'aws-lambda';

export function jsonResponse(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  };
}

export function errorResponse(statusCode: number, error: string, code?: string): APIGatewayProxyResultV2 {
  return jsonResponse(statusCode, { error, ...(code ? { code } : {}) });
}
