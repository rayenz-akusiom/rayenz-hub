import { useEffect } from 'react';
import { navigateHub } from '../lib/hub-storage';

/** Legacy route: Deck Review merged into Deck Suggest. */
export function DeckReviewApp() {
  useEffect(() => {
    navigateHub('#/deck-suggest');
  }, []);
  return null;
}
