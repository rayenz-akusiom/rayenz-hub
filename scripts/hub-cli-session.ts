/** Sign in to the Hub API and return an access token. Used by local CLI scripts. */

export async function signInHubSession(
  apiUrl: string,
  username: string,
  password: string,
): Promise<string> {
  const url = apiUrl.replace(/\/$/, '');
  if (!username || !password) {
    throw new Error('HUB_USERNAME and HUB_PASSWORD (or --username / --password) are required');
  }
  const res = await fetch(`${url}/v1/auth/sign-in`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Sign-in failed (${res.status}): ${text.slice(0, 400)}`);
  }
  const body = JSON.parse(text) as { accessToken?: string };
  if (!body.accessToken) {
    throw new Error('Sign-in response missing accessToken');
  }
  return body.accessToken;
}
