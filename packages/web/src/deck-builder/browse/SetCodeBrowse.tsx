import { useEffect, useMemo, type MouseEvent } from 'react';
import {
  formalSwapInIds,
  groupBySetCode,
  mainDeckSourceCards,
  partitionCategories,
  resolveDeckCards,
  sortCardsInGroup,
  sortSetCodeKeys,
  splitCollectionIgnored,
  WONT_COLLECT,
  type CardLayout,
  type CardSortMode,
  type CardView,
  type CategoryDef,
  type DeckDocument,
  type DeckOwnership,
  type DeckVisibility,
  type FormalSwapEntry,
} from '@rayenz-hub/shared';
import {
  CardGroup,
  DeckHeaderRow,
  type DropCardHandler,
  type SelectCardHandler,
} from './CategoryBrowse';
import { type ContextMenuPoint } from './CardTile';
import { ExtrasSection } from './ExtrasSection';
import { MasonryColumns } from './MasonryColumns';
import { useDeckExtras } from '../scryfall/useDeckExtras';
import type { DeckSyncStatus } from '../ui/SyncStatusCharm';

export function SetCodeBrowse({
  deck,
  onSelectCard,
  selectedId,
  selectedIds,
  layout = 'stacked',
  cardSort = 'name_asc',
  onDropCard,
  onCardContextMenu,
  onVisibleOrderChange,
  onSetOwnership,
  onSetVisibility,
  onRename,
  onSetDescription,
  onPickSlot,
  deckMeta,
  deckMetaWarn,
  syncStatus = null,
  filtersActive = false,
  enableSoughtGhost = false,
  representativeCard = null,
  representativeLabel = 'Representative',
  onPickRepresentative,
}: {
  deck:
    | Pick<
        DeckDocument,
        | 'cards'
        | 'categories'
        | 'format'
        | 'oracle'
        | 'name'
        | 'deckId'
        | 'ownership'
        | 'visibility'
        | 'formalSwapEntries'
        | 'coverInstanceId'
        | 'description'
      >
    | {
        cards: CardView[];
        categories: CategoryDef[];
        format?: DeckDocument['format'];
        oracle?: DeckDocument['oracle'];
        name?: string;
        deckId?: string;
        ownership?: DeckOwnership;
        visibility?: DeckVisibility;
        formalSwapEntries?: FormalSwapEntry[];
        coverInstanceId?: string | null;
        description?: string;
      };
  onSelectCard?: SelectCardHandler;
  selectedId?: string | null;
  selectedIds?: ReadonlySet<string> | null;
  layout?: CardLayout;
  cardSort?: CardSortMode;
  onDropCard?: DropCardHandler;
  onCardContextMenu?: (card: CardView, at: MouseEvent | ContextMenuPoint) => void;
  onVisibleOrderChange?: (ids: string[]) => void;
  onSetOwnership?: (ownership: DeckOwnership) => void;
  onSetVisibility?: (visibility: DeckVisibility) => void;
  onRename?: (name: string) => void;
  onSetDescription?: (description: string) => void;
  onPickSlot?: (category: string) => void;
  deckMeta?: string;
  deckMetaWarn?: boolean;
  syncStatus?: DeckSyncStatus | null;
  filtersActive?: boolean;
  enableSoughtGhost?: boolean;
  representativeCard?: CardView | null;
  representativeLabel?: string;
  onPickRepresentative?: () => void;
}) {
  const resolvedCards = useMemo(
    () => resolveDeckCards({ cards: deck.cards, oracle: deck.oracle || {} }),
    [deck.cards, deck.oracle],
  );
  const resolvedDeck = useMemo(
    () => ({ ...deck, cards: resolvedCards }),
    [deck, resolvedCards],
  );
  const swapInIds = useMemo(
    () =>
      formalSwapInIds(
        'formalSwapEntries' in deck ? deck.formalSwapEntries : undefined,
      ),
    [deck],
  );

  const { header, headerKeys, included, includedKeys } = partitionCategories(resolvedDeck);
  const format = ('format' in resolvedDeck ? resolvedDeck.format : undefined) || 'other';
  const extrasEnabled = format !== 'collection';
  const extrasSource = useMemo(
    () =>
      extrasEnabled
        ? mainDeckSourceCards({ cards: deck.cards, categories: deck.categories || [] })
        : [],
    [extrasEnabled, deck.cards, deck.categories],
  );
  const extrasCards = useDeckExtras(extrasSource, extrasEnabled);
  const mainCards = useMemo(
    () => includedKeys.flatMap((k) => included[k]),
    [includedKeys, included],
  );
  const { active: setCards, ignored: wontCollectCards } = useMemo(() => {
    if (format !== 'collection') return { active: mainCards, ignored: [] as typeof mainCards };
    return splitCollectionIgnored(mainCards);
  }, [format, mainCards]);
  const groups = useMemo(() => groupBySetCode(setCards), [setCards]);
  const sectionOrder = useMemo(() => sortSetCodeKeys(Object.keys(groups)), [groups]);

  const visibleOrder = useMemo(() => {
    const headerIds = headerKeys.flatMap((cat) =>
      sortCardsInGroup(header[cat] || [], cardSort, undefined, swapInIds).map(
        (c) => c.instanceId,
      ),
    );
    const bodyIds = sectionOrder.flatMap((setKey) => {
      const list = groups[setKey];
      if (!list?.length) return [];
      return sortCardsInGroup(list, cardSort, undefined, swapInIds).map((c) => c.instanceId);
    });
    const ignoredIds = sortCardsInGroup(wontCollectCards, cardSort, undefined, swapInIds).map(
      (c) => c.instanceId,
    );
    return [...headerIds, ...bodyIds, ...ignoredIds];
  }, [headerKeys, header, sectionOrder, groups, cardSort, swapInIds, wontCollectCards]);

  useEffect(() => {
    onVisibleOrderChange?.(visibleOrder);
  }, [onVisibleOrderChange, visibleOrder]);

  const sections = [
    ...sectionOrder
      .map((setKey) => {
        const list = groups[setKey];
        if (!list?.length) return null;
        const sorted = sortCardsInGroup(list, cardSort, undefined, swapInIds);
        return (
          <section
            key={setKey}
            className={layout === 'stacked' ? 'db-cat-column' : 'db-section'}
          >
            <h3 className="db-section-title">
              {setKey} <span className="db-count">({sorted.length})</span>
            </h3>
            <CardGroup
              cards={sorted}
              layout={layout}
              selectedId={selectedId}
              selectedIds={selectedIds}
              onSelectCard={onSelectCard}
              draggable={Boolean(onDropCard)}
              onCardContextMenu={onCardContextMenu}
              swapInIds={swapInIds}
              filtersActive={filtersActive}
              enableSoughtGhost={enableSoughtGhost}
              categoryKey={setKey}
              cardSort={cardSort}
            />
          </section>
        );
      })
      .filter(Boolean),
    ...(wontCollectCards.length
      ? [
          <section
            key={WONT_COLLECT}
            className={layout === 'stacked' ? 'db-cat-column' : 'db-section'}
          >
            <h3 className="db-section-title">
              {WONT_COLLECT} <span className="db-count">({wontCollectCards.length})</span>
            </h3>
            <CardGroup
              cards={sortCardsInGroup(wontCollectCards, cardSort, undefined, swapInIds)}
              layout={layout}
              selectedId={selectedId}
              selectedIds={selectedIds}
              onSelectCard={onSelectCard}
              draggable={Boolean(onDropCard)}
              onCardContextMenu={onCardContextMenu}
              swapInIds={swapInIds}
              filtersActive={filtersActive}
              enableSoughtGhost={enableSoughtGhost}
              categoryKey={WONT_COLLECT}
              cardSort={cardSort}
            />
          </section>,
        ]
      : []),
  ];

  const deckName =
    'name' in resolvedDeck && typeof resolvedDeck.name === 'string'
      ? resolvedDeck.name
      : undefined;

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
        format={'format' in resolvedDeck ? resolvedDeck.format : undefined}
        cardSort={cardSort}
        deckName={deckName}
        deckId={'deckId' in resolvedDeck ? resolvedDeck.deckId : undefined}
        ownership={'ownership' in resolvedDeck ? resolvedDeck.ownership : undefined}
        onSetOwnership={onSetOwnership}
        visibility={'visibility' in resolvedDeck ? resolvedDeck.visibility : undefined}
        onSetVisibility={onSetVisibility}
        onRename={onRename}
        description={
          'description' in resolvedDeck && typeof resolvedDeck.description === 'string'
            ? resolvedDeck.description
            : ''
        }
        onSetDescription={onSetDescription}
        deckMeta={deckMeta}
        deckMetaWarn={deckMetaWarn}
        syncStatus={syncStatus}
        swapInIds={swapInIds}
        coverInstanceId={
          'coverInstanceId' in resolvedDeck ? resolvedDeck.coverInstanceId : null
        }
        filtersActive={filtersActive}
        enableSoughtGhost={enableSoughtGhost}
        representativeCard={representativeCard}
        representativeLabel={representativeLabel}
        onPickRepresentative={onPickRepresentative}
      />
      {layout === 'stacked' ? (
        <MasonryColumns>{sections}</MasonryColumns>
      ) : (
        sections
      )}
      <ExtrasSection cards={extrasCards} />
    </div>
  );
}
