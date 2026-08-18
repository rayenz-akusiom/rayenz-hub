import type { APIGatewayProxyResultV2 } from 'aws-lambda';

function isLocalSam(): boolean {
  return Boolean(process.env.DYNAMODB_ENDPOINT?.trim());
}

/** CORS for SAM local only. Production HTTP API already injects these. */
export function corsHeaders(): Record<string, string> {
  if (!isLocalSam()) {
    return {};
  }
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'authorization,content-type,accept',
    'access-control-allow-methods': 'GET,PUT,POST,DELETE,OPTIONS',
  };
}

export function jsonResponse(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: {
      'content-type': 'application/json',
      ...corsHeaders(),
    },
    body: JSON.stringify(body),
  };
}

export function errorResponse(statusCode: number, error: string, code?: string): APIGatewayProxyResultV2 {
  return jsonResponse(statusCode, { error, ...(code ? { code } : {}) });
}

export function optionsResponse(): APIGatewayProxyResultV2 {
  return {
    statusCode: 204,
    headers: corsHeaders(),
    body: '',
  };
}

export function binaryResponse(
  statusCode: number,
  body: Uint8Array,
  headers: Record<string, string> = {},
): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: {
      ...corsHeaders(),
      ...headers,
    },
    body: Buffer.from(body).toString('base64'),
    isBase64Encoded: true,
  };
}
