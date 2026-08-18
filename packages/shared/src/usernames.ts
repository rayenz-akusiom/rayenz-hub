/** Reserved Cognito usernames / URL slugs. `sandbox` is unsigned local library only. */
export const SANDBOX_USERNAME = 'sandbox';

/** Retired bootstrap URL slug (never a Cognito username). */
export const RETIRED_USER_SLUG = 'default';

/** Owner slug the retired bootstrap library was moved onto. */
export const RETIRED_OWNER_SLUG = 'rayenz';

const RESERVED_USERNAMES = [SANDBOX_USERNAME, RETIRED_USER_SLUG] as const;

/** Kebab-case for URL slugs (usernames and deck names). */
export function toKebabCase(str: string): string {
  if (!str) {
    return '';
  }
  const parts = str.match(
    /[A-Z]{2,}(?=[A-Z][a-z]+[0-9]*|\b)|[A-Z]?[a-z]+[0-9]*|[A-Z]|[0-9]+/g,
  );
  if (!parts) {
    return '';
  }
  return parts.map((word) => word.toLowerCase()).join('-');
}

export function usernameToSlug(name: string): string {
  return toKebabCase(name.trim());
}

/** Canonical Cognito / directory username: trimmed lowercase. */
export function normalizeUsername(name: string): string {
  return name.trim().toLowerCase();
}

export function isReservedUsername(name: string): boolean {
  const lower = normalizeUsername(name);
  const slug = usernameToSlug(name);
  return RESERVED_USERNAMES.some((reserved) => reserved === lower || reserved === slug);
}

export function isSandboxUsername(name: string): boolean {
  const lower = normalizeUsername(name);
  return lower === SANDBOX_USERNAME || usernameToSlug(name) === SANDBOX_USERNAME;
}
