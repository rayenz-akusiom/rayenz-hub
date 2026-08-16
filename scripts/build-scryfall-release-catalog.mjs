/**
 * Fetch Scryfall /sets and write packages/shared/src/scryfall/release-catalog.generated.json
 *
 * Usage: node scripts/build-scryfall-release-catalog.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildReleaseCatalog } from '../packages/shared/src/scryfall/release-catalog.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'packages/shared/src/scryfall/release-catalog.generated.json');
const SCRYFALL_API = 'https://api.scryfall.com';
const UA = 'rayenz-hub-catalog/1.0';

async function fetchAllSets() {
  let url = `${SCRYFALL_API}/sets`;
  const sets = [];
  while (url) {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`Scryfall ${res.status} for ${url}`);
    const body = await res.json();
    sets.push(...(body.data || []));
    url = body.has_more && body.next_page ? body.next_page : null;
    if (url) await new Promise((r) => setTimeout(r, 100));
  }
  return sets.map((s) => ({
    code: String(s.code || ''),
    name: String(s.name || ''),
    set_type: String(s.set_type || ''),
    released_at: s.released_at != null ? String(s.released_at) : null,
    block_code: s.block_code != null ? String(s.block_code) : null,
    block: s.block != null ? String(s.block) : null,
    parent_set_code: s.parent_set_code != null ? String(s.parent_set_code) : null,
    digital: Boolean(s.digital),
    card_count: Number(s.card_count || 0),
  }));
}

const sets = await fetchAllSets();
const catalog = buildReleaseCatalog(sets);
fs.writeFileSync(OUT, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
const groups = catalog.releases.filter((r) => r.kind === 'group').length;
const blocks = catalog.releases.filter((r) => r.kind === 'block').length;
console.log(`Wrote ${catalog.releases.length} releases (${groups} groups, ${blocks} blocks) → ${OUT}`);
