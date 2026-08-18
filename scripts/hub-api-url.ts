/**
 * Resolve the Hub API base URL for Pages publish (env or stack output).
 * Pure helpers are unit-tested; AWS lookup stays in publish-hub / deploy-api.
 */
export const API_STACK_NAME = 'rayenz-hub-api';

export const MISSING_PUBLISH_API_URL =
  'publish:hub needs VITE_HUB_API_URL or HUB_API_URL, or stack rayenz-hub-api output HubApiUrl.';

export function normalizeHubApiUrl(raw: string): string {
  return String(raw || '').trim().replace(/\/$/, '');
}

export function hubApiUrlFromEnv(env: NodeJS.Dict<string | undefined>): string {
  return normalizeHubApiUrl(env.VITE_HUB_API_URL || env.HUB_API_URL || '');
}

export function hubApiUrlFromStackOutputs(
  outputs: Array<{ OutputKey?: string; OutputValue?: string }>,
): string {
  const hit = outputs.find((o) => o.OutputKey === 'HubApiUrl')?.OutputValue || '';
  const url = normalizeHubApiUrl(hit);
  if (!url) {
    throw new Error(`Stack ${API_STACK_NAME} is missing output HubApiUrl`);
  }
  return url;
}

export function resolvePublishHubApiUrl(
  env: NodeJS.Dict<string | undefined>,
  loadStackOutputs: () => Array<{ OutputKey?: string; OutputValue?: string }> | null,
): string {
  const fromEnv = hubApiUrlFromEnv(env);
  if (fromEnv) {
    return fromEnv;
  }
  try {
    const outputs = loadStackOutputs();
    if (outputs) {
      return hubApiUrlFromStackOutputs(outputs);
    }
  } catch {
    /* env unset and stack lookup failed */
  }
  throw new Error(MISSING_PUBLISH_API_URL);
}
