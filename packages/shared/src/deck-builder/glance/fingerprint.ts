import type { GlanceIncludeSet } from './types.js';
import { GLANCE_LAYOUT_VERSION } from './types.js';
import { sha256Hex } from './sha256.js';

function cardIdentity(card: {
  instanceId: string;
  name: string;
  setCode: string | null;
  collectorNumber: string | null;
  quantity: number;
  colours: string[];
  primaryCategory: string | null;
}): string {
  const colours = [...(card.colours || [])].sort().join('');
  return [
    card.instanceId,
    card.name.trim().toLocaleLowerCase(),
    (card.setCode || '').toLowerCase(),
    card.collectorNumber || '',
    String(card.quantity),
    colours,
    (card.primaryCategory || '').toLocaleLowerCase(),
  ].join('|');
}

export function canonicalIncludeSetMaterial(includeSet: GlanceIncludeSet): string {
  const lines = includeSet.cards
    .map(cardIdentity)
    .sort((a, b) => a.localeCompare(b));
  return lines.join('\n');
}

export function glanceFingerprint(
  includeSet: GlanceIncludeSet,
  layoutVersion: string = GLANCE_LAYOUT_VERSION,
): string {
  const material = `${layoutVersion}\n${canonicalIncludeSetMaterial(includeSet)}`;
  return sha256Hex(material);
}
