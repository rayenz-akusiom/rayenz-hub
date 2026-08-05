import { sha256Hex } from '../glance/sha256.js';
import { glanceCardIdentityBase } from '../glance/card-identity.js';
import type { SwapGlanceDensifyStage, SwapGlanceIncludeSet } from './types.js';
import { SWAP_GLANCE_GENERATION_VERSION } from './types.js';

function cardIdentity(card: {
  instanceId: string;
  name: string;
  setCode: string | null;
  collectorNumber: string | null;
  quantity: number;
  proxy?: boolean;
}): string {
  return [glanceCardIdentityBase(card), card.proxy ? '1' : '0'].join('|');
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

export type SwapGlanceFingerprintExtras = {
  pageIndex?: number;
  pageCount?: number;
  densifyStage?: SwapGlanceDensifyStage;
};

export function swapGlanceFingerprint(
  includeSet: SwapGlanceIncludeSet,
  generationVersion: string = SWAP_GLANCE_GENERATION_VERSION,
  extras: SwapGlanceFingerprintExtras = {},
): string {
  const pageIndex = extras.pageIndex ?? 1;
  const pageCount = extras.pageCount ?? 1;
  const densifyStage = extras.densifyStage ?? 'base';
  return sha256Hex(
    [
      generationVersion,
      `page:${pageIndex}/${pageCount}`,
      `densify:${densifyStage}`,
      canonicalSwapGlanceMaterial(includeSet),
    ].join('\n'),
  );
}
