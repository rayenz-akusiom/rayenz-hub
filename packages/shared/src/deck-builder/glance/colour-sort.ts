import type { GlanceCard } from './types.js';

const WUBRG = ['W', 'U', 'B', 'R', 'G'] as const;

function normalizeColours(colours: string[]): string[] {
  const set = new Set<string>();
  for (const c of colours || []) {
    const u = String(c || '').trim().toUpperCase();
    if (WUBRG.includes(u as (typeof WUBRG)[number])) set.add(u);
  }
  return WUBRG.filter((c) => set.has(c));
}

function colourBucket(colours: string[]): number {
  const norm = normalizeColours(colours);
  if (norm.length === 1) return WUBRG.indexOf(norm[0] as (typeof WUBRG)[number]);
  if (norm.length >= 2) return 5;
  return 6;
}

function multicolourKey(colours: string[]): string {
  return normalizeColours(colours).join('');
}

function compareSecondary(a: GlanceCard, b: GlanceCard): number {
  const nameA = String(a.name || '').trim().toLocaleLowerCase();
  const nameB = String(b.name || '').trim().toLocaleLowerCase();
  if (nameA !== nameB) return nameA.localeCompare(nameB);

  const setA = String(a.setCode || '').toLocaleLowerCase();
  const setB = String(b.setCode || '').toLocaleLowerCase();
  if (!setA && setB) return 1;
  if (setA && !setB) return -1;
  if (setA !== setB) return setA.localeCompare(setB);

  const cnA = String(a.collectorNumber || '');
  const cnB = String(b.collectorNumber || '');
  if (cnA !== cnB) return cnA.localeCompare(cnB, undefined, { numeric: true });

  return a.instanceId.localeCompare(b.instanceId);
}

export function compareGlanceCardsForColourSort(a: GlanceCard, b: GlanceCard): number {
  const bucketA = colourBucket(a.colours);
  const bucketB = colourBucket(b.colours);
  if (bucketA !== bucketB) return bucketA - bucketB;

  if (bucketA === 5) {
    const keyA = multicolourKey(a.colours);
    const keyB = multicolourKey(b.colours);
    if (keyA.length !== keyB.length) return keyA.length - keyB.length;
    if (keyA !== keyB) return keyA.localeCompare(keyB);
  }

  return compareSecondary(a, b);
}

export function sortNonLands(cards: GlanceCard[]): GlanceCard[] {
  return [...cards].sort(compareGlanceCardsForColourSort);
}

export function sortLands(cards: GlanceCard[]): GlanceCard[] {
  return [...cards].sort((a, b) => {
    if (a.isBasicLand !== b.isBasicLand) return a.isBasicLand ? -1 : 1;
    return compareSecondary(a, b);
  });
}
