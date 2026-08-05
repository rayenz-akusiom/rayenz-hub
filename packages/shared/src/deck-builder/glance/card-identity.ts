/** Shared base fields for glance fingerprint card lines (deck + swap). */
export function glanceCardIdentityBase(card: {
  instanceId: string;
  name: string;
  setCode: string | null;
  collectorNumber: string | null;
  quantity: number;
}): string {
  return [
    card.instanceId,
    card.name.trim().toLocaleLowerCase(),
    (card.setCode || '').toLowerCase(),
    card.collectorNumber || '',
    String(card.quantity),
  ].join('|');
}
