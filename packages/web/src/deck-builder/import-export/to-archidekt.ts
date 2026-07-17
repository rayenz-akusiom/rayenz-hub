import {
  applyFormalSwapsToCards,
  canonicalizeSwapCategory,
  PROXIES_CATEGORY,
  type CardInstance,
  type DeckDocument,
} from '@rayenz-hub/shared';

function categoryHeader(name: string, includedInDeck: boolean, includedInPrice: boolean): string {
  const flags: string[] = [];
  if (!includedInDeck) flags.push('noDeck');
  if (!includedInPrice) flags.push('noPrice');
  const suffix = flags.length ? `{${flags.join('}{')}}` : '';
  return `[${name}${suffix}]`;
}

function categoryWithFlags(
  name: string,
  meta: { includedInDeck: boolean; includedInPrice: boolean } | undefined,
): string {
  const includedInDeck = meta ? meta.includedInDeck !== false : true;
  const includedInPrice =
    meta != null
      ? meta.includedInPrice !== false
      : name !== PROXIES_CATEGORY;
  const flags: string[] = [];
  if (!includedInDeck) flags.push('noDeck');
  if (!includedInPrice) flags.push('noPrice');
  const suffix = flags.length ? `{${flags.join('}{')}}` : '';
  return `${name}${suffix}`;
}

function formatCardLine(
  card: CardInstance,
  catMeta: Map<string, { includedInDeck: boolean; includedInPrice: boolean }>,
): string {
  const qty = card.quantity || 1;
  const printing =
    card.setCode && card.collectorNumber != null
      ? ` (${card.setCode}) ${card.collectorNumber}`
      : '';
  let line = `${qty} ${card.name}${printing}`;
  if (card.proxy) {
    const primary = canonicalizeSwapCategory(card.primaryCategory || 'Main');
    const primaryPart = categoryWithFlags(primary, catMeta.get(primary));
    const proxyPart = categoryWithFlags(
      PROXIES_CATEGORY,
      catMeta.get(PROXIES_CATEGORY) ?? { includedInDeck: true, includedInPrice: false },
    );
    line += ` [${primaryPart},${proxyPart}]`;
  }
  return line;
}

/** Build Archidekt replace-deck import text from a Hub deck document. */
export function buildArchidektImportText(doc: DeckDocument): string {
  const cards = applyFormalSwapsToCards(doc.cards, doc.formalSwapEntries, doc.format);
  const catMeta = new Map<string, { includedInDeck: boolean; includedInPrice: boolean }>();
  for (const c of doc.categories) {
    const name = canonicalizeSwapCategory(c.name);
    const prev = catMeta.get(name);
    catMeta.set(name, {
      includedInDeck: prev?.includedInDeck !== false && c.includedInDeck !== false,
      includedInPrice: prev?.includedInPrice !== false && c.includedInPrice !== false,
    });
  }
  if (cards.some((c) => c.proxy) && !catMeta.has(PROXIES_CATEGORY)) {
    catMeta.set(PROXIES_CATEGORY, { includedInDeck: true, includedInPrice: false });
  }
  const byCat: Record<string, typeof cards> = {};
  for (const card of cards) {
    const key = canonicalizeSwapCategory(card.primaryCategory || 'Main');
    if (!byCat[key]) byCat[key] = [];
    byCat[key].push(card);
  }
  const lines: string[] = [];
  const order = [
    ...doc.categories.map((c) => canonicalizeSwapCategory(c.name)),
    ...Object.keys(byCat).filter((k) => !catMeta.has(k)),
  ].filter((name) => name !== PROXIES_CATEGORY);
  const seen = new Set<string>();
  for (const cat of order) {
    if (seen.has(cat) || !byCat[cat]?.length) continue;
    seen.add(cat);
    const meta = catMeta.get(cat);
    lines.push(
      categoryHeader(cat, meta ? meta.includedInDeck : true, meta ? meta.includedInPrice : true),
    );
    for (const card of byCat[cat]) {
      lines.push(formatCardLine(card, catMeta));
    }
    lines.push('');
  }
  return lines.join('\n').trim() + '\n';
}
