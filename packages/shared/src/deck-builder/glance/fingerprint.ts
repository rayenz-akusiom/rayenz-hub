import type { GlanceIncludeSet } from './types.js';
import { GLANCE_GENERATION_VERSION } from './types.js';
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

function roleMaterial(label: string, cards: { instanceId: string }[]): string {
  const ids = cards.map((c) => c.instanceId).sort((a, b) => a.localeCompare(b));
  return `${label}:${ids.join(',')}`;
}

export function canonicalIncludeSetMaterial(includeSet: GlanceIncludeSet): string {
  const lines = includeSet.cards
    .map(cardIdentity)
    .sort((a, b) => a.localeCompare(b));
  // Highlight assignment is part of the identity: the same 100 cards render
  // differently depending on which roles sit on the plates.
  lines.push(roleMaterial('commanders', includeSet.commanders));
  lines.push(roleMaterial('lieutenants', includeSet.lieutenants));
  return lines.join('\n');
}

export function glanceFingerprint(
  includeSet: GlanceIncludeSet,
  generationVersion: string = GLANCE_GENERATION_VERSION,
): string {
  const material = `${generationVersion}\n${canonicalIncludeSetMaterial(includeSet)}`;
  return sha256Hex(material);
}
