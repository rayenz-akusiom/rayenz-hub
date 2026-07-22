import { unifyWantSources, type WantSource } from './wants-aggregate.js';

export type WantsPriceFilter = {
  /** null = filter off */
  minUsd: number | null;
};

/**
 * Price filter: missing USD always passes (proxy targets). When minUsd set, priced cards must be >= min.
 */
export function passesPriceFilter(source: WantSource, filter: WantsPriceFilter): boolean {
  if (filter.minUsd == null) return true;
  if (source.usd == null) return true;
  return source.usd >= filter.minUsd;
}

export function filterWantSources(
  sources: WantSource[],
  filter: WantsPriceFilter,
): WantSource[] {
  return (sources || []).filter((s) => passesPriceFilter(s, filter));
}

function exportLines(sources: WantSource[]): string[] {
  const rows = unifyWantSources(sources);
  return rows.map((r) => `${r.totalQuantity} ${r.displayName}`);
}

/** Combined qty / printing-sought name lines (shopping / Archidekt paste). */
export function buildArchidektWantsText(sources: WantSource[]): string {
  const lines = exportLines(sources);
  if (!lines.length) return '';
  return ['// Seeking / Queued In (combined)', ...lines].join('\n') + '\n';
}

/** Same combined lines without section header. */
export function buildNameQtyWantsText(sources: WantSource[]): string {
  const lines = exportLines(sources);
  if (!lines.length) return '';
  return lines.join('\n') + '\n';
}
