import { useEffect } from 'react';
import { resolveLegacyDeckBuilderHash } from '../hub/routes';
import { navigateHub } from '../lib/hub-storage';
import { toKebabCase } from '../lib/string-utils';
import { readLibraryIndex, listDecks } from './store/deck-store';

export function LegacyDeckBuilderRedirect() {
  useEffect(() => {
    void (async () => {
      let summaries = readLibraryIndex();
      if (!summaries.length) {
        try {
          summaries = await listDecks();
        } catch {
          /* use empty index */
        }
      }

      const lookupFormat = (deckSlug: string) => {
        const match = summaries.find((d) => toKebabCase(d.name) === deckSlug);
        if (match?.format === 'cube') return 'cube';
        if (match?.format === 'commander') return 'commander';
        return null;
      };

      const target = resolveLegacyDeckBuilderHash(window.location.hash, lookupFormat);
      navigateHub(target);
    })();
  }, []);

  return (
    <div className="db-app">
      <p className="db-meta">Redirecting to deck builder…</p>
    </div>
  );
}
