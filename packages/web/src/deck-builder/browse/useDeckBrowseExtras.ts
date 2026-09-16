import { useMemo } from 'react';
import { mainDeckSourceCards, type CardView, type CategoryDef } from '@rayenz-hub/shared';
import { useDeckExtras } from '../scryfall/useDeckExtras';

/** Resolve display-only extras for main-deck browse (tokens / emblems / dungeons). */
export function useDeckBrowseExtras(
  deck: { cards: CardView[]; categories?: CategoryDef[] },
  extrasEnabled: boolean,
): CardView[] {
  const extrasSource = useMemo(
    () =>
      extrasEnabled
        ? mainDeckSourceCards({ cards: deck.cards, categories: deck.categories || [] })
        : [],
    [extrasEnabled, deck.cards, deck.categories],
  );
  return useDeckExtras(extrasSource, extrasEnabled);
}
