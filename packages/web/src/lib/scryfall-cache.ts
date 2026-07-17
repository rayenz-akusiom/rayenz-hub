const printCache: Record<string, unknown[]> = {};

export async function fetchPrintings(
  cardName: string,
  options?: { defaultScryfallId?: string },
): Promise<unknown[]> {
  const opts = options || {};
  const cacheKey = String(cardName || '').toLowerCase();
  if (printCache[cacheKey]) {
    return printCache[cacheKey];
  }
  const url =
    'https://api.scryfall.com/cards/search?q=' +
    encodeURIComponent('!"' + cardName + '"') +
    '&unique=prints&order=released';
  const resp = await fetch(url);
  if (!resp.ok) {
    if (opts.defaultScryfallId) {
      const single = await fetch('https://api.scryfall.com/cards/' + opts.defaultScryfallId);
      if (single.ok) {
        const one = await single.json();
        printCache[cacheKey] = [one];
        return printCache[cacheKey];
      }
    }
    throw new Error('Scryfall lookup failed for ' + cardName);
  }
  const json = (await resp.json()) as { data?: unknown[] };
  const prints = json.data || [];
  printCache[cacheKey] = prints;
  return prints;
}

export const ScryfallCache = {
  printCache,
  fetchPrintings,
};
