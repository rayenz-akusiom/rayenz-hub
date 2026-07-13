export type SettingsDomain = 'DAILIES' | 'ORDER_RECONCILE' | 'DECK_SUGGEST';

const REST_TO_SETTINGS_DOMAIN: Record<string, SettingsDomain> = {
  dailies: 'DAILIES',
  'order-reconcile': 'ORDER_RECONCILE',
  'deck-suggest': 'DECK_SUGGEST',
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

export function settingsDomainFromPath(domain: string): SettingsDomain | null {
  return REST_TO_SETTINGS_DOMAIN[domain] ?? null;
}
