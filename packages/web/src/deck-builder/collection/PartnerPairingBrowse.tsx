import { useEffect, useMemo } from 'react';
import {
  partnerPairingLane,
  resolveDeckCards,
  sortCardsInGroup,
  sortPartnerPairingLaneKeys,
  toRepresentativeCardView,
  type CardLayout,
  type CardSortMode,
  type CardView,
  type CollectionRepresentativeCard,
  type DeckDocument,
} from '@rayenz-hub/shared';
import { CardGroup, DeckHeaderRow, type SelectCardHandler } from '../browse/CategoryBrowse';
import { MasonryColumns } from '../browse/MasonryColumns';
import { type ContextMenuPoint } from '../browse/CardTile';
import type { DeckSyncStatus } from '../ui/SyncStatusCharm';

export function PartnerPairingBrowse({
  deck,
  representativeCard,
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
}: {
  deck: Pick<DeckDocument, 'cards' | 'oracle' | 'name' | 'deckId' | 'description' | 'format'>;
  representativeCard?: CollectionRepresentativeCard | null;
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
}) {
  const resolved = useMemo(
    () => resolveDeckCards({ cards: deck.cards, oracle: deck.oracle || {} }),
    [deck.cards, deck.oracle],
  );
  const groups = useMemo(() => {
    const out = new Map<string, CardView[]>();
    for (const card of resolved) {
      const lane = partnerPairingLane(card);
      const list = out.get(lane) || [];
      list.push(card);
      out.set(lane, list);
    }
    return sortPartnerPairingLaneKeys([...out.keys()]).map(
      (key) => [key, out.get(key)!] as const,
    );
  }, [resolved]);

  const visibleOrder = useMemo(
    () => groups.flatMap(([, cards]) => sortCardsInGroup(cards, cardSort).map((card) => card.instanceId)),
    [groups, cardSort],
  );

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
        representativeCard={representativeCard ? toRepresentativeCardView(representativeCard) : null}
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
    </div>
  );
}
