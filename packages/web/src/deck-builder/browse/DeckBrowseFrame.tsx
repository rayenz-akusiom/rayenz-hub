import type { MouseEvent, ReactNode } from 'react';
import type {
  CardLayout,
  CardSortMode,
  CardView,
  DeckFormat,
  DeckOwnership,
  DeckVisibility,
} from '@rayenz-hub/shared';
import {
  DeckHeaderRow,
  type DropCardHandler,
  type SelectCardHandler,
} from './CategoryBrowse';
import { type ContextMenuPoint } from './CardTile';
import { ExtrasSection } from './ExtrasSection';
import { MasonryColumns } from './MasonryColumns';
import type { DeckSyncStatus } from '../ui/SyncStatusCharm';

export function DeckBrowseFrame({
  children,
  layout = 'stacked',
  extrasCards,
  header,
  headerKeys,
  selectedId,
  selectedIds,
  onSelectCard,
  onDropCard,
  onCardContextMenu,
  onPickSlot,
  format,
  cardSort = 'name_asc',
  deckName,
  deckId,
  ownership,
  onSetOwnership,
  visibility,
  onSetVisibility,
  onRename,
  description = '',
  onSetDescription,
  deckMeta,
  deckMetaWarn,
  syncStatus = null,
  swapInIds,
  coverInstanceId = null,
  filtersActive = false,
  enableSoughtGhost = false,
  representativeCard = null,
  representativeLabel = 'Representative',
  onPickRepresentative,
}: {
  children: ReactNode;
  layout?: CardLayout;
  extrasCards: readonly CardView[];
  header: Record<string, CardView[]>;
  headerKeys: string[];
  selectedId?: string | null;
  selectedIds?: ReadonlySet<string> | null;
  onSelectCard?: SelectCardHandler;
  onDropCard?: DropCardHandler;
  onCardContextMenu?: (card: CardView, at: MouseEvent | ContextMenuPoint) => void;
  onPickSlot?: (category: string) => void;
  format?: DeckFormat | null;
  cardSort?: CardSortMode;
  deckName?: string;
  deckId?: string;
  ownership?: DeckOwnership;
  onSetOwnership?: (ownership: DeckOwnership) => void;
  visibility?: DeckVisibility;
  onSetVisibility?: (visibility: DeckVisibility) => void;
  onRename?: (name: string) => void;
  description?: string;
  onSetDescription?: (description: string) => void;
  deckMeta?: string;
  deckMetaWarn?: boolean;
  syncStatus?: DeckSyncStatus | null;
  swapInIds?: ReadonlySet<string> | null;
  coverInstanceId?: string | null;
  filtersActive?: boolean;
  enableSoughtGhost?: boolean;
  representativeCard?: CardView | null;
  representativeLabel?: string;
  onPickRepresentative?: () => void;
}) {
  return (
    <div className="db-browse">
      <DeckHeaderRow
        header={header}
        headerKeys={headerKeys}
        selectedId={selectedId}
        selectedIds={selectedIds}
        onSelectCard={onSelectCard}
        onDropCard={onDropCard}
        onCardContextMenu={onCardContextMenu}
        onPickSlot={onPickSlot}
        format={format}
        cardSort={cardSort}
        deckName={deckName}
        deckId={deckId}
        ownership={ownership}
        onSetOwnership={onSetOwnership}
        visibility={visibility}
        onSetVisibility={onSetVisibility}
        onRename={onRename}
        description={description}
        onSetDescription={onSetDescription}
        deckMeta={deckMeta}
        deckMetaWarn={deckMetaWarn}
        syncStatus={syncStatus}
        swapInIds={swapInIds}
        coverInstanceId={coverInstanceId}
        filtersActive={filtersActive}
        enableSoughtGhost={enableSoughtGhost}
        representativeCard={representativeCard}
        representativeLabel={representativeLabel}
        onPickRepresentative={onPickRepresentative}
      />
      {layout === 'stacked' ? <MasonryColumns>{children}</MasonryColumns> : children}
      <ExtrasSection cards={extrasCards} />
    </div>
  );
}
