import { useEffect, useMemo } from 'react';
import {
  collectionBinderSourceCards,
  resolveDeckCards,
  sortCardsInGroup,
  type CardLayout,
  type CardSortMode,
  type CardView,
  type DeckDocument,
} from '@rayenz-hub/shared';
import { CardGroup, DeckHeaderRow, type SelectCardHandler } from '../browse/CategoryBrowse';
import { ExtrasSection } from '../browse/ExtrasSection';
import { MasonryColumns } from '../browse/MasonryColumns';
import { type ContextMenuPoint } from '../browse/CardTile';
import { useDeckExtras } from '../scryfall/useDeckExtras';
import type { DeckSyncStatus } from '../ui/SyncStatusCharm';

export type GroupedLaneBrowseProps = {
  deck: Pick<DeckDocument, 'cards' | 'oracle' | 'name' | 'deckId' | 'description' | 'format'>;
  groups: ReadonlyArray<readonly [string, CardView[]]>;
  representativeCard?: CardView | null;
  selectedIds?: ReadonlySet<string> | null;
  onSelectCard?: SelectCardHandler;
  onCardContextMenu?: (card: CardView, at: MouseEvent | ContextMenuPoint) => void;
  onVisibleOrderChange?: (ids: string[]) => void;
  layout?: CardLayout;
  cardSort?: CardSortMode;
  onRename?: (name: string) => void;
  onSetDescription?: (description: string) => void;
  deckMeta?: string;
  syncStatus?: DeckSyncStatus | null;
  onPickRepresentative?: () => void;
  /** Planeswalker browse only — show Scryfall-derived extras. */
  showExtras?: boolean;
};

export function GroupedLaneBrowse({
  deck,
  groups,
  representativeCard = null,
  selectedIds,
  onSelectCard,
  onCardContextMenu,
  onVisibleOrderChange,
  layout = 'grid',
  cardSort = 'name_asc',
  onRename,
  onSetDescription,
  deckMeta,
  syncStatus = null,
  onPickRepresentative,
  showExtras = false,
}: GroupedLaneBrowseProps) {
  const visibleOrder = useMemo(
    () => groups.flatMap(([, cards]) => sortCardsInGroup(cards, cardSort).map((card) => card.instanceId)),
    [groups, cardSort],
  );
  const extrasSource = useMemo(
    () => (showExtras ? collectionBinderSourceCards(deck) : []),
    [showExtras, deck.cards, deck.oracle],
  );
  const extrasCards = useDeckExtras(extrasSource, showExtras);

  useEffect(() => {
    onVisibleOrderChange?.(visibleOrder);
  }, [onVisibleOrderChange, visibleOrder]);

  return (
    <div className="db-browse">
      <DeckHeaderRow
        header={{}}
        headerKeys={[]}
        selectedIds={selectedIds}
        onSelectCard={onSelectCard}
        onCardContextMenu={onCardContextMenu}
        format="collection"
        deckName={deck.name}
        deckId={deck.deckId}
        description={deck.description || ''}
        onRename={onRename}
        onSetDescription={onSetDescription}
        deckMeta={deckMeta}
        syncStatus={syncStatus}
        representativeCard={representativeCard}
        representativeLabel="Binder"
        onPickRepresentative={onPickRepresentative}
        enableSoughtGhost
      />
      {layout === 'stacked' ? (
        <MasonryColumns>
          {groups.map(([lane, cards]) => (
            <section key={lane} className="db-cat-column">
              <h3 className="db-section-title">
                {lane} <span className="db-count">({cards.length})</span>
              </h3>
              <CardGroup
                cards={sortCardsInGroup(cards, cardSort)}
                layout={layout}
                selectedIds={selectedIds}
                onSelectCard={onSelectCard}
                draggable={false}
                onCardContextMenu={onCardContextMenu}
                categoryKey={lane}
                enableSoughtGhost
              />
            </section>
          ))}
        </MasonryColumns>
      ) : (
        groups.map(([lane, cards]) => (
          <section key={lane} className="db-section">
            <h3 className="db-section-title">
              {lane} <span className="db-count">({cards.length})</span>
            </h3>
            <CardGroup
              cards={sortCardsInGroup(cards, cardSort)}
              layout={layout}
              selectedIds={selectedIds}
              onSelectCard={onSelectCard}
              draggable={false}
              onCardContextMenu={onCardContextMenu}
              categoryKey={lane}
              enableSoughtGhost
            />
          </section>
        ))
      )}
      <ExtrasSection cards={extrasCards} layout={layout} />
    </div>
  );
}

/** Shared resolve helper for lane browse wrappers. */
export function resolveLaneCards(
  deck: Pick<DeckDocument, 'cards' | 'oracle'>,
): CardView[] {
  return resolveDeckCards({ cards: deck.cards, oracle: deck.oracle || {} });
}
