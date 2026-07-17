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
