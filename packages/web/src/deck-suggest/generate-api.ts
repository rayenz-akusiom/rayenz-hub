import { apiFetch } from '../api/hub-api';
import type { SuggestGenerateRequest, SuggestGenerateResponse } from '@rayenz-hub/shared';

export async function apiPostSuggestGenerate(
  body: SuggestGenerateRequest,
): Promise<SuggestGenerateResponse> {
  const data = await apiFetch<SuggestGenerateResponse>('/v1/suggest/generate', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (!data) {
    throw new Error('Hub API returned an empty generate response.');
  }
  return data;
}
