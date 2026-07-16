import {

  detectDeckFormat,

  normalizeCardQuantities,

  normalizeColourIdentity,

  seedFormalSwapsFromCategories,

  type CardInstance,

  type CategoryDef,

  type DeckDocument,

} from '@rayenz-hub/shared';



let idSeq = 0;

function nextId(prefix: string): string {

  idSeq += 1;

  return `${prefix}-${Date.now()}-${idSeq}`;

}



function parseFoil(raw: Record<string, unknown>): boolean {

  if (raw.foil === true) return true;

  if (typeof raw.modifier === 'string' && raw.modifier === 'Foil') return true;

  return false;

}



/** Derive a display name from an Archidekt deck URL slug (e.g. winds_heed_my_command). */

export function deckNameFromArchidektUrl(url: string | null | undefined): string | null {

  if (!url) return null;

  const m = String(url).match(/archidekt\.com\/decks\/\d+\/([^/?#]+)/i);

  if (!m) return null;

  return m[1]

    .replace(/_/g, ' ')

    .replace(/\b\w+/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());

}



function resolveImportedDeckName(

  snapshot: {

    name?: string;

    deck_name?: string;

    url?: string;

    deck?: { name?: string };

  },

  existing: DeckDocument | null | undefined,

  nameOverride?: string,

): string {

  if (nameOverride?.trim()) return nameOverride.trim();

  const nested = snapshot.deck?.name;

  const direct = snapshot.name || snapshot.deck_name || nested;

  if (direct && String(direct).trim()) return String(direct).trim();

  const fromUrl =

    deckNameFromArchidektUrl(snapshot.url) || deckNameFromArchidektUrl(existing?.archidektUrl);

  if (fromUrl) return fromUrl;

  if (existing?.name) return existing.name;

  return 'Archidekt deck';

}



/** Parse simple Archidekt-style import lines: `1 Card Name` or `Card Name` with optional [Category]. */

export function parseImportText(text: string): { name: string; quantity: number; category: string }[] {

  const lines = String(text || '')

    .split(/\r?\n/)

    .map((l) => l.trim())

    .filter(Boolean);

  const out: { name: string; quantity: number; category: string }[] = [];

  let currentCategory = 'Main';

  for (const line of lines) {

    const cat = line.match(/^\[(.+)\]$/);

    if (cat) {

      currentCategory = cat[1].replace(/\{[^}]+\}/g, '').trim() || currentCategory;

      continue;

    }

    const m = line.match(/^(\d+)\s+x?\s*(.+)$/i) || line.match(/^(\d+)\s+(.+)$/);

    if (m) {

      out.push({ quantity: parseInt(m[1], 10) || 1, name: m[2].trim(), category: currentCategory });

    } else {

      out.push({ quantity: 1, name: line, category: currentCategory });

    }

  }

  return out;

}



function categoriesFromSettings(

  settings: Record<string, { includedInDeck?: boolean; includedInPrice?: boolean }> | undefined,

): CategoryDef[] {

  if (!settings || typeof settings !== 'object') return [];

  return Object.entries(settings).map(([name, v]) => ({

    name,

    includedInDeck: v?.includedInDeck !== false,

    includedInPrice: v?.includedInPrice !== false,

  }));

}



export function documentFromImportText(

  text: string,

  opts: { deckId?: string; name?: string; formatHint?: string } = {},

): DeckDocument {

  const parsed = parseImportText(text);

  const now = new Date().toISOString();

  const catNames = [...new Set(parsed.map((p) => p.category))];

  const categories: CategoryDef[] = catNames.map((name) => ({

    name,

    includedInDeck: !/^New Set (In|Out)$/i.test(name) && name !== 'Maybeboard',

    includedInPrice: !/^New Set (In|Out)$/i.test(name),

  }));

  const rawCards: CardInstance[] = parsed.map((row) => ({

    instanceId: nextId('c'),

    name: row.name,

    quantity: row.quantity,

    primaryCategory: row.category,

    categories: [row.category],

    stack: null,

    setCode: null,

    collectorNumber: null,

    scryfallId: null,

    colourIdentity: [],

    typeLine: null,

    archidektCardId: null,

    foil: false,

  }));

  const name = opts.name || 'Imported deck';

  const format = detectDeckFormat({ name, format: opts.formatHint });

  const cards = normalizeCardQuantities(rawCards, format, nextId);

  const formalSwapEntries = seedFormalSwapsFromCategories(cards, []);

  return {

    schemaVersion: 1,

    deckId: opts.deckId || nextId('deck'),

    name,

    format,

    archidektId: null,

    archidektUrl: null,

    categories,

    cards,

    formalSwapEntries,

    browseViewDefault: null,

    cardLayoutDefault: 'stacked',

    createdAt: now,

    updatedAt: now,

    lastArchidektSyncAt: null,

    lastArchidektImportAt: now,

  };

}



export function documentFromArchidektSnapshot(

  snapshot: {

    deck_id?: string | number;

    id?: string | number;

    name?: string;

    deck_name?: string;

    url?: string;

    deck?: { name?: string };

    categories?: { name: string; includedInDeck?: boolean; includedInPrice?: boolean }[];

    category_settings?: Record<string, { includedInDeck?: boolean; includedInPrice?: boolean }>;

    cards?: Record<string, unknown>[];

  },

  existing?: DeckDocument | null,

  opts: { clearSwaps?: boolean; nameOverride?: string } = {},

): DeckDocument {

  const now = new Date().toISOString();

  const archidektId = Number(snapshot.deck_id || snapshot.id) || null;

  const deckId = String(archidektId || existing?.deckId || nextId('deck'));

  const inheritedName = resolveImportedDeckName(snapshot, existing, opts.nameOverride);

  const format = detectDeckFormat({ name: inheritedName, format: existing?.format });



  let categories: CategoryDef[] = (snapshot.categories || []).map((c) => ({

    name: c.name,

    includedInDeck: c.includedInDeck !== false,

    includedInPrice: c.includedInPrice !== false,

  }));

  if (!categories.length) {

    categories = categoriesFromSettings(snapshot.category_settings);

  }

  if (!categories.length) {

    categories = existing?.categories || [];

  }



  const rawCards: CardInstance[] = (snapshot.cards || []).map((raw, idx) => {

    const cats = Array.isArray(raw.categories)

      ? (raw.categories as string[])

      : raw.primary_category

        ? [String(raw.primary_category)]

        : ['Main'];

    const primary = String(raw.primary_category || cats[0] || 'Main');

    const ci = normalizeColourIdentity(raw.color_identity ?? raw.colourIdentity ?? raw.colorIdentity);

    const scryfallId =

      (raw.scryfall_id as string) ||

      (raw.scryfallId as string) ||

      (raw.uid as string) ||

      null;

    return {

      instanceId: String(raw.id || raw.archidektCardId || `c-${idx}-${Date.now()}`),

      name: String(raw.name || 'Unknown'),

      quantity: Number(raw.quantity) || 1,

      primaryCategory: primary,

      categories: cats,

      stack: (raw.stack as string) || null,

      setCode: (raw.set_code as string) || (raw.setCode as string) || null,

      collectorNumber:

        raw.collector_number != null

          ? String(raw.collector_number)

          : raw.collectorNumber != null

            ? String(raw.collectorNumber)

            : null,

      scryfallId,

      colourIdentity: ci,

      typeLine: (raw.type_line as string) || (raw.typeLine as string) || null,

      archidektCardId: raw.id != null ? Number(raw.id) : null,

      foil: parseFoil(raw),

    };

  });



  const cards = normalizeCardQuantities(rawCards, format, nextId);



  const keepSwaps = !opts.clearSwaps && (existing?.formalSwapEntries?.length || 0) > 0;

  const formalSwapEntries = keepSwaps

    ? existing!.formalSwapEntries

    : seedFormalSwapsFromCategories(cards, []);



  return {

    schemaVersion: 1,

    deckId,

    name: inheritedName,

    format,

    archidektId,

    archidektUrl: snapshot.url || existing?.archidektUrl || null,

    categories,

    cards,

    formalSwapEntries,

    browseViewDefault: existing?.browseViewDefault ?? null,

    cardLayoutDefault: existing?.cardLayoutDefault ?? 'stacked',

    createdAt: existing?.createdAt || now,

    updatedAt: now,

    lastArchidektSyncAt: existing?.lastArchidektSyncAt ?? null,

    lastArchidektImportAt: now,

  };

}


