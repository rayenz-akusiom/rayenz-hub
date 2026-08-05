import type {
  SwapGlanceIncludeSet,
  SwapGlancePackMode,
  SwapGlanceRow,
  SwapGlanceSection,
} from './types.js';
import type { DensifyConfig } from './layout-shared.js';

export type { DensifyConfig };

export const DENSIFY_LADDER: DensifyConfig[] = [
  {
    stage: 'base',
    seekingMode: 'grid',
    lookingForMode: 'grid',
    convertPairsToLookingFor: false,
  },
  {
    stage: 'seeking_stacked',
    seekingMode: 'stacked',
    lookingForMode: 'grid',
    convertPairsToLookingFor: false,
  },
  {
    stage: 'looking_for_stacked',
    seekingMode: 'stacked',
    lookingForMode: 'stacked',
    convertPairsToLookingFor: false,
  },
  {
    stage: 'swaps_to_looking_for_grid',
    seekingMode: 'stacked',
    lookingForMode: 'grid',
    convertPairsToLookingFor: true,
  },
  {
    stage: 'swaps_to_looking_for_stacked',
    seekingMode: 'stacked',
    lookingForMode: 'stacked',
    convertPairsToLookingFor: true,
  },
];

function convertPairsToLookingFor(sections: SwapGlanceSection[]): SwapGlanceSection[] {
  return sections
    .map((section) => {
      const rows: SwapGlanceRow[] = [];
      for (const row of section.rows) {
        if (row.kind === 'pair') {
          if (row.in) {
            rows.push({
              kind: 'single',
              entryId: row.entryId,
              sourceKind: 'queued_in',
              card: row.in,
            });
          }
          continue;
        }
        rows.push(row);
      }
      return { ...section, rows };
    })
    .filter((s) => s.rows.length > 0);
}

function isSeekingRow(row: SwapGlanceRow): boolean {
  return row.kind === 'single' && row.sourceKind === 'seeking';
}

function isFormalRow(row: SwapGlanceRow): boolean {
  return !isSeekingRow(row);
}

function splitCategories(includeSet: SwapGlanceIncludeSet): {
  formal: SwapGlanceSection[];
  seeking: SwapGlanceSection[];
} {
  const formal: SwapGlanceSection[] = [];
  const seeking: SwapGlanceSection[] = [];
  for (const section of includeSet.sections) {
    const formalRows = section.rows.filter(isFormalRow);
    const seekingRows = section.rows.filter(isSeekingRow);
    if (formalRows.length) {
      formal.push({ ...section, rows: formalRows });
    }
    if (seekingRows.length) {
      seeking.push({ ...section, rows: seekingRows });
    }
  }
  return { formal, seeking };
}

function hasPairs(sections: SwapGlanceSection[]): boolean {
  return sections.some((s) => s.rows.some((r) => r.kind === 'pair'));
}

function hasLookingForSingles(sections: SwapGlanceSection[]): boolean {
  return sections.some((s) =>
    s.rows.some((r) => r.kind === 'single' && r.sourceKind === 'queued_in'),
  );
}

function hasSeeking(sections: SwapGlanceSection[]): boolean {
  return sections.some((s) => s.rows.some(isSeekingRow));
}

/** Stages that change nothing for this include set are skipped. */
export function densifyLadderFor(includeSet: SwapGlanceIncludeSet): DensifyConfig[] {
  const { formal, seeking } = splitCategories(includeSet);
  const pairs = hasPairs(formal);
  const lookingFor = hasLookingForSingles(formal) || includeSet.mode === 'in_only';
  const seekingPresent = seeking.length > 0 || hasSeeking(includeSet.sections);

  return DENSIFY_LADDER.filter((cfg) => {
    if (cfg.stage === 'seeking_stacked' && !seekingPresent) return false;
    if (cfg.stage === 'looking_for_stacked') {
      // Only meaningful when looking-for singles exist (in_only) and are not already
      // going to be converted from pairs in a later stage-only path.
      if (!lookingFor && !pairs) return false;
      if (pairs && !lookingFor) return false; // full-mode pairs only — skip until convert
      return true;
    }
    if (
      (cfg.stage === 'swaps_to_looking_for_grid' ||
        cfg.stage === 'swaps_to_looking_for_stacked') &&
      !pairs
    ) {
      return false;
    }
    return true;
  });
}

export function prepareCategories(
  includeSet: SwapGlanceIncludeSet,
  densify: DensifyConfig,
): { formal: SwapGlanceSection[]; seeking: SwapGlanceSection[]; formalMode: SwapGlancePackMode } {
  let { formal, seeking } = splitCategories(includeSet);
  if (densify.convertPairsToLookingFor) {
    formal = convertPairsToLookingFor(formal);
  }
  const formalMode: SwapGlancePackMode =
    densify.convertPairsToLookingFor || includeSet.mode === 'in_only' || !hasPairs(formal)
      ? densify.lookingForMode
      : 'grid';
  return { formal, seeking, formalMode };
}
