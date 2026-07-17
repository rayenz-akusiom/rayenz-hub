import {
  applyFormalSwapsToCards,
  canonicalizeSwapCategory,
  type DeckDocument,
} from '@rayenz-hub/shared';

function categoryHeader(name: string, includedInDeck: boolean, includedInPrice: boolean): string {
  const flags: string[] = [];
  if (!includedInDeck) flags.push('noDeck');
  if (!includedInPrice) flags.push('noPrice');
  const suffix = flags.length ? `{${flags.join('}{')}}` : '';
  return `[${name}${suffix}]`;
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
  ];
  const seen = new Set<string>();
  for (const cat of order) {
    if (seen.has(cat) || !byCat[cat]?.length) continue;
    seen.add(cat);
    const meta = catMeta.get(cat);
    lines.push(
      categoryHeader(cat, meta ? meta.includedInDeck : true, meta ? meta.includedInPrice : true),
    );
    for (const card of byCat[cat]) {
      const qty = card.quantity || 1;
      const printing =
        card.setCode && card.collectorNumber != null
          ? ` (${card.setCode}) ${card.collectorNumber}`
          : '';
      lines.push(`${qty} ${card.name}${printing}`);
    }
    lines.push('');
  }
  return lines.join('\n').trim() + '\n';
}
