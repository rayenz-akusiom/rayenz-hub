export type SettingsDomain = 'DAILIES' | 'ORDER_RECONCILE' | 'DECK_SUGGEST' | 'DECK_BUILDER';

const REST_TO_SETTINGS_DOMAIN: Record<string, SettingsDomain> = {
  dailies: 'DAILIES',
  'order-reconcile': 'ORDER_RECONCILE',
  'deck-suggest': 'DECK_SUGGEST',
  'deck-builder': 'DECK_BUILDER',
};

export function userPk(userId: string): string {
  return `USER::${userId}`;
}

export function settingsSk(domain: SettingsDomain): string {
  return `SETTINGS::${domain}`;
}

export function profileSk(deckId: string): string {
  return `PROFILE::${deckId}`;
}

export function reviewSk(fileId: string): string {
  return `REVIEW::${fileId}`;
}

export function setPoolSk(codesKey: string): string {
  return `SET_POOL::${codesKey}`;
}

export function deckSk(deckId: string): string {
  return `DECK::${deckId}`;
}

export function settingsDomainFromPath(domain: string): SettingsDomain | null {
  return REST_TO_SETTINGS_DOMAIN[domain] ?? null;
}

export const SYSTEM_PK = 'SYSTEM';
export const SPEND_LOCK_SK = 'SPEND_LOCK';
export const INVITE_TTL_DAYS = 7;

export function inviteItemSk(inviteId: string): string {
  return `INVITE::${inviteId}`;
}

export function inviteTokenPk(tokenHash: string): string {
  return `INVITE_TOKEN::${tokenHash}`;
}

export function ratePk(bucket: string): string {
  return `RATE::${bucket}`;
}

export function userS3Prefix(userId: string): string {
  return `users/${userId}`;
}

export function userDeckS3Key(userId: string, deckId: string): string {
  return `${userS3Prefix(userId)}/decks/${deckId}.json`;
}

export function userProfileS3Key(userId: string, deckId: string): string {
  return `${userS3Prefix(userId)}/profiles/${deckId}.yaml`;
}

export function userSetPoolS3Key(userId: string, codesKey: string): string {
  return `${userS3Prefix(userId)}/set-pools/${codesKey}.json`;
}

export function userGlanceCacheKey(
  userId: string,
  generationVersion: string,
  fingerprint: string,
): string {
  return `${userS3Prefix(userId)}/glance-cache/${generationVersion}/${fingerprint}.png`;
}

export function userSwapGlanceCacheKey(
  userId: string,
  generationVersion: string,
  fingerprint: string,
): string {
  return `${userS3Prefix(userId)}/swap-glance-cache/${generationVersion}/${fingerprint}.png`;
}

/** Rewrite a legacy global S3 key onto the per-user prefix. */
export function migrateS3KeyToUser(userId: string, s3Key: string): string {
  if (s3Key.startsWith(`users/${userId}/`)) {
    return s3Key;
  }
  const stripped = s3Key.replace(/^users\/[^/]+\//, '');
  return `${userS3Prefix(userId)}/${stripped}`;
}
