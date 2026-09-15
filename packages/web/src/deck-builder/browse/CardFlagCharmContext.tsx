import {
  cardSupportsFoilToggle,
  collectionDefaultTargetQuantity,
  isCollectionDeck,
  type CardView,
  type DeckDocument,
} from '@rayenz-hub/shared';
import { createContext, useContext, type MouseEvent, type ReactNode } from 'react';

export type CardFlagCharmContextValue = {
  enabled: boolean;
  readOnly: boolean;
  queuesReadOnly: boolean;
  deck: DeckDocument;
  selectedIds: ReadonlySet<string>;
  resolveTargetIds: (card: CardView) => string[];
  onToggleFoil: (instanceIds: string[]) => void;
  onToggleProxy: (instanceIds: string[]) => void;
  onToggleSeeking: (instanceIds: string[]) => void;
};

const CardFlagCharmContext = createContext<CardFlagCharmContextValue | null>(null);

export function CardFlagCharmProvider({
  value,
  children,
}: {
  value: CardFlagCharmContextValue;
  children: ReactNode;
}) {
  return <CardFlagCharmContext.Provider value={value}>{children}</CardFlagCharmContext.Provider>;
}

export function useCardFlagCharms(): CardFlagCharmContextValue | null {
  return useContext(CardFlagCharmContext);
}

export function foilCharmEnabled(deck: DeckDocument, card: CardView): boolean {
  if (isCollectionDeck(deck)) return true;
  return cardSupportsFoilToggle(deck, card) || Boolean(card.foil);
}

export function proxyCharmEnabled(deck: DeckDocument): boolean {
  return !isCollectionDeck(deck);
}

export function seekingCharmEnabled(deck: DeckDocument, queuesReadOnly: boolean): boolean {
  if (queuesReadOnly) return false;
  if (isCollectionDeck(deck) && collectionDefaultTargetQuantity(deck) !== 1) return false;
  return true;
}

export function stopCharmClick(e: MouseEvent) {
  e.preventDefault();
  e.stopPropagation();
}
