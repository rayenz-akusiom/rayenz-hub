import { useMemo } from 'react';
import {
  partnerPairingLane,
  sortPartnerPairingLaneKeys,
  type CardLayout,
  type CardSortMode,
  type CardView,
  type DeckDocument,
} from '@rayenz-hub/shared';
import { type SelectCardHandler } from '../browse/CategoryBrowse';
import { type ContextMenuPoint } from '../browse/CardTile';
import type { DeckSyncStatus } from '../ui/SyncStatusCharm';
import { GroupedLaneBrowse, resolveLaneCards } from './GroupedLaneBrowse';

export function PartnerPairingBrowse({
  deck,
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
}: {
  deck: Pick<DeckDocument, 'cards' | 'oracle' | 'name' | 'deckId' | 'description' | 'format'>;
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
}) {
  const groups = useMemo(() => {
    const resolved = resolveLaneCards(deck);
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
  }, [deck.cards, deck.oracle]);

  return (
    <GroupedLaneBrowse
      deck={deck}
      groups={groups}
      representativeCard={representativeCard}
      selectedIds={selectedIds}
      onSelectCard={onSelectCard}
      onCardContextMenu={onCardContextMenu}
      onVisibleOrderChange={onVisibleOrderChange}
      layout={layout}
      cardSort={cardSort}
      onRename={onRename}
      onSetDescription={onSetDescription}
      deckMeta={deckMeta}
      syncStatus={syncStatus}
      onPickRepresentative={onPickRepresentative}
    />
  );
}
