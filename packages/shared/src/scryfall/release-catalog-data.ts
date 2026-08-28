import type { ReleaseCatalog } from './release-catalog.js';
import catalogJson from './release-catalog.generated.json';

/** Bundled Scryfall group/block catalog (regenerate via `npm run build:release-catalog`). */
export function getReleaseCatalog(): ReleaseCatalog {
  const raw = catalogJson as ReleaseCatalog;
  return {
    ...raw,
    secretLairSets: raw.secretLairSets ?? [],
  };
}
