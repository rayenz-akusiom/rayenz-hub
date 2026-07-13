import { jsonResponse } from '../lib/response.js';

export function handleHealth() {
  return jsonResponse(200, { status: 'ok', version: 'v1' });
}
