import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import {
  DECK_BUILDER_SETTINGS_EVENT,
  DEFAULT_DECK_BUILDER_SETTINGS,
  colourIdentitySectionsFor,
  formalSwapInIds,
  groupByColourIdentity,
  partitionCategories,
  resolveDeckCards,
  sortCardsInGroup,
  type CardLayout,
  type CardSortMode,
  type CardView,
  type CategoryDef,
  type DeckBuilderSettingsPayload,
  type DeckDocument,
  type FormalSwapEntry,
} from '@rayenz-hub/shared';
import { loadDeckBuilderSettings } from '../../api/hub-api';
import {
  CardGroup,
  DeckHeaderRow,
  type DropCardHandler,
  type SelectCardHandler,
} from './CategoryBrowse';
import { MasonryColumns } from './MasonryColumns';
import type { DeckSyncStatus } from '../ui/SyncStatusCharm';

function mergeStyle(remote: DeckBuilderSettingsPayload | null): DeckBuilderSettingsPayload {
  return { ...DEFAULT_DECK_BUILDER_SETTINGS, ...(remote || {}) };
}

export function ColourIdentityBrowse({
  deck,
  onSelectCard,
  selectedId,
  selectedIds,
  layout = 'stacked',
  cardSort = 'name_asc',
  separateLands = false,
  onDropCard,
  onCardContextMenu,
  onVisibleOrderChange,
  deckMeta,
  deckMetaWarn,
  syncStatus = null,
}: {
  deck:
    | Pick<DeckDocument, 'cards' | 'categories' | 'format' | 'oracle' | 'name' | 'formalSwapEntries'>
    | {
        cards: CardView[];
        categories: CategoryDef[];
        format?: DeckDocument['format'];
        oracle?: DeckDocument['oracle'];
        name?: string;
        formalSwapEntries?: FormalSwapEntry[];
      };
  onSelectCard?: SelectCardHandler;
  selectedId?: string | null;
  selectedIds?: ReadonlySet<string> | null;
  layout?: CardLayout;
  cardSort?: CardSortMode;
  separateLands?: boolean;
  onDropCard?: DropCardHandler;
  onCardContextMenu?: (card: CardView, e: MouseEvent) => void;
  onVisibleOrderChange?: (ids: string[]) => void;
  deckMeta?: string;
  deckMetaWarn?: boolean;
  syncStatus?: DeckSyncStatus | null;
}) {
  const [style, setStyle] = useState<DeckBuilderSettingsPayload>(DEFAULT_DECK_BUILDER_SETTINGS);
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { settings } = await loadDeckBuilderSettings();
        if (!cancelled) setStyle(mergeStyle(settings));
      } catch {
        /* keep defaults */
      }
    })();

    function onSettings(event: Event) {
      const detail = (event as CustomEvent<DeckBuilderSettingsPayload>).detail;
      if (detail) setStyle(mergeStyle(detail));
    }
    window.addEventListener(DECK_BUILDER_SETTINGS_EVENT, onSettings);
    return () => {
      cancelled = true;
      window.removeEventListener(DECK_BUILDER_SETTINGS_EVENT, onSettings);
    };
  }, []);

  const { header, headerKeys, included, includedKeys } = partitionCategories(resolvedDeck);
  const mainCards = useMemo(
    () => includedKeys.flatMap((k) => included[k]),
    [includedKeys, included],
  );
  const groups = useMemo(
    () => groupByColourIdentity(mainCards, { style, separateLands }),
    [mainCards, style, separateLands],
  );
  const sectionOrder = useMemo(
    () => colourIdentitySectionsFor({ style, separateLands }),
    [style, separateLands],
  );

  const visibleOrder = useMemo(() => {
    const ciOpts = { style, separateLands };
    const headerIds = headerKeys.flatMap((cat) =>
      sortCardsInGroup(header[cat] || [], cardSort, ciOpts, swapInIds).map((c) => c.instanceId),
    );
    const bodyIds = sectionOrder.flatMap((section) => {
      const list = groups[section];
      if (!list?.length) return [];
      return sortCardsInGroup(list, cardSort, ciOpts, swapInIds).map((c) => c.instanceId);
    });
    return [...headerIds, ...bodyIds];
  }, [headerKeys, header, sectionOrder, groups, cardSort, style, separateLands, swapInIds]);

  useEffect(() => {
    onVisibleOrderChange?.(visibleOrder);
  }, [onVisibleOrderChange, visibleOrder]);

  const sections = sectionOrder
    .map((section) => {
      const list = groups[section];
      if (!list?.length) return null;
      const sorted = sortCardsInGroup(list, cardSort, { style, separateLands }, swapInIds);
      return (
        <section
          key={section}
          className={layout === 'stacked' ? 'db-cat-column' : 'db-section'}
        >
          <h3 className="db-section-title">
            {section} <span className="db-count">({sorted.length})</span>
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
          />
        </section>
      );
    })
    .filter(Boolean);

  const deckName = 'name' in resolvedDeck && typeof resolvedDeck.name === 'string' ? resolvedDeck.name : undefined;

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
        format={'format' in resolvedDeck ? resolvedDeck.format : undefined}
        cardSort={cardSort}
        deckName={deckName}
        deckMeta={deckMeta}
        deckMetaWarn={deckMetaWarn}
        syncStatus={syncStatus}
        swapInIds={swapInIds}
      />
      {layout === 'stacked' ? (
        <MasonryColumns>{sections}</MasonryColumns>
      ) : (
        sections
      )}
    </div>
  );
}
