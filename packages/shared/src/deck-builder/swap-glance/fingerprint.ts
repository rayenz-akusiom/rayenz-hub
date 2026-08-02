import { sha256Hex } from '../glance/sha256.js';
import type { SwapGlanceIncludeSet } from './types.js';
import { SWAP_GLANCE_GENERATION_VERSION } from './types.js';

function cardIdentity(card: {
  instanceId: string;
  name: string;
  setCode: string | null;
  collectorNumber: string | null;
  quantity: number;
  proxy?: boolean;
}): string {
  return [
    card.instanceId,
    card.name.trim().toLocaleLowerCase(),
    (card.setCode || '').toLowerCase(),
    card.collectorNumber || '',
    String(card.quantity),
    card.proxy ? '1' : '0',
  ].join('|');
}

export function canonicalSwapGlanceMaterial(includeSet: SwapGlanceIncludeSet): string {
  const codes = (includeSet.filterSetCodes || [])
    .map((c) => String(c || '').trim().toUpperCase())
    .filter(Boolean);
  const lines: string[] = [
    `mode:${includeSet.mode}`,
    `seeking:${includeSet.includeSeeking ? '1' : '0'}`,
    `sets:${codes.join(',')}`,
  ];
  for (const section of includeSet.sections) {
    lines.push(`section:${section.deckId}|${section.headerText}`);
    for (const row of section.rows) {
      if (row.kind === 'pair') {
        lines.push(
          `pair:${row.entryId}|out:${row.out ? cardIdentity(row.out) : '-'}|in:${row.in ? cardIdentity(row.in) : '-'}`,
        );
      } else {
        lines.push(`single:${row.sourceKind}:${row.entryId}|${cardIdentity(row.card)}`);
      }
    }
  }
  return lines.join('\n');
}

export function swapGlanceFingerprint(
  includeSet: SwapGlanceIncludeSet,
  generationVersion: string = SWAP_GLANCE_GENERATION_VERSION,
): string {
  return sha256Hex(`${generationVersion}\n${canonicalSwapGlanceMaterial(includeSet)}`);
}
