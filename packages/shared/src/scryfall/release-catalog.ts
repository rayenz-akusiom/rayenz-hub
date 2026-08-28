/**
 * Build Scryfall group/block release catalog from /sets.
 * Pure helpers live here; the script fetches and writes JSON.
 */

export type ScryfallSetRow = {
  code: string;
  name: string;
  set_type: string;
  released_at?: string | null;
  block_code?: string | null;
  block?: string | null;
  parent_set_code?: string | null;
  digital?: boolean;
  card_count?: number;
};

export type ReleaseKind = 'group' | 'block' | 'pinned';

export type SecretLairSetRow = {
  code: string;
  name: string;
  released_at: string | null;
};

export type ReleaseCatalogEntry = {
  id: string;
  kind: ReleaseKind;
  /** Seed code for Scryfall `g:` or `b:` syntax. */
  code: string;
  name: string;
  released_at: string | null;
  set_codes: string[];
};

export type ReleaseCatalog = {
  formatVersion: 1;
  generatedAt: string;
  releases: ReleaseCatalogEntry[];
  /** Scryfall sets whose name starts with "Secret Lair" (for pinned Suggest shortcuts). */
  secretLairSets: SecretLairSetRow[];
};

/** Types we treat as playable anchors / family members for Suggest. */
export const PLAYABLE_RELEASE_SET_TYPES = new Set([
  'expansion',
  'core',
  'draft_innovation',
  'masters',
  'commander',
  'masterpiece',
]);

const GROUP_ANCHOR_TYPES = new Set(['expansion', 'core', 'draft_innovation', 'masters']);

function upper(code: string | null | undefined): string {
  return String(code || '')
    .trim()
    .toUpperCase();
}

/** Walk parent_set_code to the top of the Scryfall family tree. */
export function familyRootCode(
  code: string,
  byCode: Map<string, ScryfallSetRow>,
): string {
  let current = upper(code);
  const seen = new Set<string>();
  while (current && !seen.has(current)) {
    seen.add(current);
    const row = byCode.get(current);
    const parent = upper(row?.parent_set_code);
    if (!parent || !byCode.has(parent)) return current;
    current = parent;
  }
  return current;
}

export function expandGroupSetCodes(
  seedCode: string,
  allSets: ScryfallSetRow[],
): string[] {
  const byCode = new Map(allSets.map((s) => [upper(s.code), s] as const));
  const seed = upper(seedCode);
  if (!byCode.has(seed)) return [];

  const root = familyRootCode(seed, byCode);
  const codes = new Set<string>();
  for (const row of allSets) {
    const code = upper(row.code);
    if (!code) continue;
    if (familyRootCode(code, byCode) === root) {
      codes.add(code);
    }
  }
  return [...codes].sort();
}

export function expandBlockSetCodes(
  blockOrSetCode: string,
  allSets: ScryfallSetRow[],
): string[] {
  const needle = upper(blockOrSetCode);
  const byCode = new Map(allSets.map((s) => [upper(s.code), s] as const));
  let blockCode = needle;
  const asSet = byCode.get(needle);
  if (asSet?.block_code) {
    blockCode = upper(asSet.block_code);
  }
  const codes = allSets
    .filter((s) => upper(s.block_code) === blockCode)
    .map((s) => upper(s.code))
    .filter(Boolean);
  return [...new Set(codes)].sort();
}

function pickGroupAnchor(
  familyCodes: string[],
  byCode: Map<string, ScryfallSetRow>,
): ScryfallSetRow | null {
  const rows = familyCodes.map((c) => byCode.get(c)!).filter(Boolean);
  const preferred =
    rows.find((r) => GROUP_ANCHOR_TYPES.has(r.set_type) && !r.parent_set_code) ||
    rows.find((r) => GROUP_ANCHOR_TYPES.has(r.set_type)) ||
    rows.find((r) => PLAYABLE_RELEASE_SET_TYPES.has(r.set_type)) ||
    rows[0];
  return preferred || null;
}

/** Non-digital Scryfall sets whose product name starts with "Secret Lair". */
export function buildSecretLairSets(allSets: ScryfallSetRow[]): SecretLairSetRow[] {
  const rows: SecretLairSetRow[] = [];
  for (const row of allSets) {
    const code = upper(row.code);
    if (!code || row.digital) continue;
    const name = String(row.name || '').trim();
    if (!/^secret lair/i.test(name)) continue;
    rows.push({
      code,
      name,
      released_at: row.released_at ? String(row.released_at) : null,
    });
  }
  rows.sort((a, b) => {
    const da = a.released_at || '';
    const db = b.released_at || '';
    if (da !== db) return db.localeCompare(da);
    return a.name.localeCompare(b.name);
  });
  return rows;
}

/**
 * Build dropdown catalog: one group per Scryfall parent/child family (playable),
 * plus one block entry per distinct block_code.
 */
export function buildReleaseCatalog(
  allSets: ScryfallSetRow[],
  generatedAt = new Date().toISOString(),
): ReleaseCatalog {
  const byCode = new Map(allSets.map((s) => [upper(s.code), s] as const));
  const familyToCodes = new Map<string, string[]>();

  for (const row of allSets) {
    const code = upper(row.code);
    if (!code || row.digital) continue;
    if (!PLAYABLE_RELEASE_SET_TYPES.has(row.set_type) && !row.parent_set_code) {
      // Still include non-playable children later via family walk from playable roots.
      continue;
    }
    if (!PLAYABLE_RELEASE_SET_TYPES.has(row.set_type)) continue;
    const root = familyRootCode(code, byCode);
    const list = familyToCodes.get(root) || [];
    if (!list.includes(code)) list.push(code);
    familyToCodes.set(root, list);
  }

  // Expand each family with all related codes (tokens/promos/etc.) for metadata.
  const groups: ReleaseCatalogEntry[] = [];
  for (const [root] of familyToCodes) {
    const setCodes = expandGroupSetCodes(root, allSets);
    const anchor = pickGroupAnchor(setCodes, byCode);
    if (!anchor) continue;
    const code = upper(anchor.code);
    groups.push({
      id: `group:${code.toLowerCase()}`,
      kind: 'group',
      code,
      name: anchor.name,
      released_at: anchor.released_at ? String(anchor.released_at) : null,
      set_codes: setCodes,
    });
  }

  const blockMap = new Map<string, { name: string; codes: string[]; released_at: string | null }>();
  for (const row of allSets) {
    const bc = upper(row.block_code);
    if (!bc || row.digital) continue;
    const entry = blockMap.get(bc) || {
      name: row.block || bc,
      codes: [],
      released_at: null,
    };
    const code = upper(row.code);
    if (code && !entry.codes.includes(code)) entry.codes.push(code);
    if (row.block) entry.name = row.block;
    if (row.released_at) {
      const d = String(row.released_at);
      if (!entry.released_at || d > entry.released_at) entry.released_at = d;
    }
    blockMap.set(bc, entry);
  }

  const blocks: ReleaseCatalogEntry[] = [...blockMap.entries()].map(([code, meta]) => ({
    id: `block:${code.toLowerCase()}`,
    kind: 'block' as const,
    code,
    name: meta.name,
    released_at: meta.released_at,
    set_codes: meta.codes.sort(),
  }));

  const releases = [...groups, ...blocks].sort((a, b) => {
    const da = a.released_at || '';
    const db = b.released_at || '';
    if (da !== db) return db.localeCompare(da);
    if (a.kind !== b.kind) return a.kind === 'group' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  return {
    formatVersion: 1,
    generatedAt,
    releases,
    secretLairSets: buildSecretLairSets(allSets),
  };
}
