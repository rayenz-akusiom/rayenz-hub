import { useEffect, useMemo, useState, type MouseEvent, type ReactNode } from 'react';
import {
  pickCommanderPair,
  partitionCategories,
  resolveDeckCards,
  sortCardsInGroup,
  cardDisplayName,
  categoryPlaceholderCount,
  categoryTarget,
  formalSwapInIds,
  primaryCategoryCount,
  groupKeysByCubeCategoryBand,
  type BrowseView,
  type CardLayout,
  type CardSortMode,
  type CardView,
  type CategoryDef,
  type CategoryMembership,
  type DeckDocument,
  type DeckFormat,
  type FormalSwapEntry,
  categoryKeySortFor,
} from '@rayenz-hub/shared';
import { FormatBadge } from '../ui/FormatBadge';
import { CardTile, DRAG_MIME, type SelectCardHandler } from './CardTile';
import { MasonryColumns } from './MasonryColumns';

export type DropCardHandler = (
  instanceId: string,
  category: string,
  opts?: { commanderSlot?: 0 | 1 },
) => void;

export type { SelectCardHandler };

function cardIsSelected(
  instanceId: string,
  selectedIds?: ReadonlySet<string> | null,
  selectedId?: string | null,
): boolean {
  if (selectedIds) return selectedIds.has(instanceId);
  return selectedId === instanceId;
}

/** True while a deck-builder card drag is in progress. */
function useDeckBuilderDragging(): boolean {
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    function isDeckBuilderDrag(e: DragEvent): boolean {
      const types = e.dataTransfer?.types;
      if (!types) return false;
      const list = Array.from(types);
      return list.includes(DRAG_MIME) || list.includes('text/plain');
    }

    function onDragStart(e: DragEvent) {
      if (isDeckBuilderDrag(e)) setDragging(true);
    }
    function onDragEnd() {
      setDragging(false);
    }

    document.addEventListener('dragstart', onDragStart);
    document.addEventListener('dragend', onDragEnd);
    document.addEventListener('drop', onDragEnd);
    return () => {
      document.removeEventListener('dragstart', onDragStart);
      document.removeEventListener('dragend', onDragEnd);
      document.removeEventListener('drop', onDragEnd);
    };
  }, []);

  return dragging;
}

function PartnerTie({ illegal }: { illegal?: boolean }) {
  return (
    <span className={`db-partner-tie${illegal ? ' is-illegal' : ''}`} aria-hidden="true">
      <svg viewBox="0 0 24 24" width="1em" height="1em" focusable="false">
        <path
          fill="currentColor"
          d="M7 12a4 4 0 0 1 4-4h2v2h-2a2 2 0 1 0 0 4h2v2h-2a4 4 0 0 1-4-4zm6-4h2a4 4 0 0 1 0 8h-2v-2h2a2 2 0 0 0 0-4h-2V8z"
        />
      </svg>
    </span>
  );
}

export type CardContextMenuHandler = (card: CardView, e: MouseEvent) => void;

export function CardGroup({
  cards,
  layout,
  selectedId,
  selectedIds,
  onSelectCard,
  draggable,
  onCardContextMenu,
  categoryKey,
  placeholderCount = 0,
  swapInIds,
}: {
  cards: Array<CardView & { membership?: CategoryMembership }>;
  layout: CardLayout;
  selectedId?: string | null;
  selectedIds?: ReadonlySet<string> | null;
  onSelectCard?: SelectCardHandler;
  draggable?: boolean;
  onCardContextMenu?: CardContextMenuHandler;
  /** Disambiguates duplicate instance keys in multi-category browse. */
  categoryKey?: string;
  /** Empty visual slots appended after real cards (target gap). */
  placeholderCount?: number;
  /** Formal swap In instance ids — rendered as temporary ghosts. */
  swapInIds?: ReadonlySet<string> | null;
}) {
  const placeholders = Array.from({ length: Math.max(0, placeholderCount) }, (_, i) => (
    <div
      key={`placeholder:${categoryKey || ''}:${i}`}
      className="db-card-placeholder"
      aria-hidden="true"
    >
      <span className="db-card-placeholder-plus">+</span>
    </div>
  ));

  if (layout === 'stacked') {
    return (
      <div className="db-card-stack">
        {cards.map((card) => (
          <div
            key={`${card.instanceId}:${categoryKey || ''}:${card.membership || 'primary'}`}
            className="db-card-stack-item"
          >
            <CardTile
              card={card}
              selected={cardIsSelected(card.instanceId, selectedIds, selectedId)}
              onSelect={onSelectCard}
              draggable={draggable}
              onContextMenu={onCardContextMenu}
              membership={card.membership || 'primary'}
              swapInGhost={Boolean(swapInIds?.has(card.instanceId))}
            />
            <button
              type="button"
              className="db-card-stack-peek"
              tabIndex={-1}
              aria-hidden="true"
              title={cardDisplayName(card)}
              onClick={(e) => onSelectCard?.(card, e)}
              onContextMenu={(e) => {
                if (!onCardContextMenu) return;
                e.preventDefault();
                onCardContextMenu(card, e);
              }}
            />
          </div>
        ))}
        {placeholders.map((slot, i) => (
          <div key={`placeholder-wrap:${categoryKey || ''}:${i}`} className="db-card-stack-item">
            {slot}
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="db-card-grid">
      {cards.map((card) => (
        <CardTile
          key={`${card.instanceId}:${categoryKey || ''}:${card.membership || 'primary'}`}
          card={card}
          selected={cardIsSelected(card.instanceId, selectedIds, selectedId)}
          onSelect={onSelectCard}
          draggable={draggable}
          onContextMenu={onCardContextMenu}
          membership={card.membership || 'primary'}
          swapInGhost={Boolean(swapInIds?.has(card.instanceId))}
        />
      ))}
      {placeholders}
    </div>
  );
}

export function DropSection({
  category,
  cards,
  layout,
  selectedId,
  selectedIds,
  onSelectCard,
  onDropCard,
  onCardContextMenu,
  onEditCategory,
  variant = 'section',
  cardSort = 'name_asc',
  target = null,
  primaryCount,
  warnTarget = false,
  swapInIds,
}: {
  category: string;
  cards: Array<CardView & { membership?: CategoryMembership }>;
  layout: CardLayout;
  selectedId?: string | null;
  selectedIds?: ReadonlySet<string> | null;
  onSelectCard?: SelectCardHandler;
  onDropCard?: DropCardHandler;
  onCardContextMenu?: CardContextMenuHandler;
  onEditCategory?: (category: string) => void;
  variant?: 'section' | 'header' | 'column';
  cardSort?: CardSortMode;
  target?: number | null;
  /** Primary-only count for target warnings (multi browse may inflate `cards.length`). */
  primaryCount?: number;
  warnTarget?: boolean;
  swapInIds?: ReadonlySet<string> | null;
}) {
  const [dragOver, setDragOver] = useState(false);
  const canDrop = Boolean(onDropCard);
  const base =
    variant === 'header' ? 'db-header-cat' : variant === 'column' ? 'db-cat-column' : 'db-section';
  const sorted = useMemo(
    () => sortCardsInGroup(cards, cardSort, undefined, swapInIds),
    [cards, cardSort, swapInIds],
  );
  const n = primaryCount != null ? primaryCount : sorted.length;
  const countLabel =
    target != null ? `(${n}/${target})` : `(${n})`;
  const mismatch = warnTarget && target != null && n !== target;
  const placeholderCount = categoryPlaceholderCount(n, target);
  const titleClass =
    variant === 'header' ? 'db-header-cat-title' : 'db-section-title';

  return (
    <section
      className={`${base}${dragOver ? ' is-drop-target' : ''}${mismatch ? ' is-target-warn' : ''}`}
      onDragOver={(e) => {
        if (!canDrop) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        if (!canDrop) return;
        e.preventDefault();
        setDragOver(false);
        const id = e.dataTransfer.getData(DRAG_MIME) || e.dataTransfer.getData('text/plain');
        if (id) onDropCard?.(id, category);
      }}
    >
      {onEditCategory ? (
        <button
          type="button"
          className={`${titleClass} db-section-title-edit${mismatch ? ' is-target-warn' : ''}`}
          onClick={() => onEditCategory(category)}
          title={`Edit ${category}`}
          aria-label={`Edit ${category}`}
        >
          <span className="db-section-title-text">
            {category} <span className="db-count">{countLabel}</span>
          </span>
          <span className="db-section-title-pencil" aria-hidden="true">
            ✎
          </span>
        </button>
      ) : (
        <h3 className={`${titleClass}${mismatch ? ' is-target-warn' : ''}`}>
          {category} <span className="db-count">{countLabel}</span>
        </h3>
      )}
      <CardGroup
        cards={sorted}
        layout={layout}
        selectedId={selectedId}
        selectedIds={selectedIds}
        onSelectCard={onSelectCard}
        draggable={canDrop}
        onCardContextMenu={onCardContextMenu}
        categoryKey={category}
        placeholderCount={placeholderCount}
        swapInIds={swapInIds}
      />
    </section>
  );
}

function CommanderSlot({
  slot,
  card,
  selectedId,
  selectedIds,
  onSelectCard,
  onDropCard,
  onCardContextMenu,
  draggable,
}: {
  slot: 0 | 1;
  card: CardView | null;
  selectedId?: string | null;
  selectedIds?: ReadonlySet<string> | null;
  onSelectCard?: SelectCardHandler;
  onDropCard?: DropCardHandler;
  onCardContextMenu?: CardContextMenuHandler;
  draggable?: boolean;
}) {
  const [dragOver, setDragOver] = useState(false);
  const canDrop = Boolean(onDropCard);

  return (
    <div
      className={`db-commander-slot${card ? '' : ' is-empty'}${dragOver ? ' is-drop-target' : ''}`}
      onDragOver={(e) => {
        if (!canDrop) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        if (!onDropCard) return;
        e.preventDefault();
        setDragOver(false);
        const id = e.dataTransfer.getData(DRAG_MIME) || e.dataTransfer.getData('text/plain');
        if (id) onDropCard(id, 'Commander', { commanderSlot: slot });
      }}
    >
      {card ? (
        <CardTile
          card={card}
          selected={cardIsSelected(card.instanceId, selectedIds, selectedId)}
          onSelect={onSelectCard}
          draggable={draggable}
          onContextMenu={onCardContextMenu}
        />
      ) : (
        <span className="db-commander-slot-placeholder">Drop commander</span>
      )}
    </div>
  );
}

function CommanderSlots({
  commanders,
  selectedId,
  selectedIds,
  onSelectCard,
  onDropCard,
  onCardContextMenu,
  dragging,
}: {
  commanders: CardView[];
  selectedId?: string | null;
  selectedIds?: ReadonlySet<string> | null;
  onSelectCard?: SelectCardHandler;
  onDropCard?: DropCardHandler;
  onCardContextMenu?: CardContextMenuHandler;
  dragging: boolean;
}) {
  const canDrop = Boolean(onDropCard);
  const slot0 = commanders[0] ?? null;
  const slot1 = commanders[1] ?? null;
  const showSecond =
    commanders.length >= 2 || (commanders.length === 1 && dragging);
  const pair = pickCommanderPair(commanders);
  const bothFilled = Boolean(slot0 && slot1);
  const illegal = bothFilled && pair.status === 'illegal';

  return (
    <div
      className={`db-partner-pair${illegal ? ' is-illegal' : ''}`}
      aria-label={illegal ? 'Commanders (illegal partner pair)' : 'Commanders'}
    >
      <h3 className="db-partner-pair-title">
        Commander{commanders.length !== 1 ? 's' : ''}{' '}
        <span className="db-count">({commanders.length})</span>
      </h3>
      <div className="db-partner-pair-row">
        <CommanderSlot
          slot={0}
          card={slot0}
          selectedId={selectedId}
          selectedIds={selectedIds}
          onSelectCard={onSelectCard}
          onDropCard={onDropCard}
          onCardContextMenu={onCardContextMenu}
          draggable={canDrop}
        />
        {showSecond ? (
          <>
            {bothFilled ? <PartnerTie illegal={illegal} /> : null}
            <CommanderSlot
              slot={1}
              card={slot1}
              selectedId={selectedId}
              selectedIds={selectedIds}
              onSelectCard={onSelectCard}
              onDropCard={onDropCard}
              onCardContextMenu={onCardContextMenu}
              draggable={canDrop}
            />
          </>
        ) : null}
      </div>
      {illegal ? (
        <p className="db-partner-pair-warn" role="status">
          These commanders can’t partner
        </p>
      ) : null}
    </div>
  );
}

export function DeckHeaderRow({
  header,
  headerKeys,
  selectedId,
  selectedIds,
  onSelectCard,
  onDropCard,
  onCardContextMenu,
  onEditCategory,
  format,
  cardSort = 'name_asc',
  deckName,
  deckMeta,
  deckMetaWarn,
  swapInIds,
}: {
  header: Record<string, CardView[]>;
  headerKeys: string[];
  selectedId?: string | null;
  selectedIds?: ReadonlySet<string> | null;
  onSelectCard?: SelectCardHandler;
  onDropCard?: DropCardHandler;
  onCardContextMenu?: CardContextMenuHandler;
  onEditCategory?: (category: string) => void;
  format?: DeckFormat | null;
  cardSort?: CardSortMode;
  deckName?: string;
  deckMeta?: string;
  deckMetaWarn?: boolean;
  swapInIds?: ReadonlySet<string> | null;
}) {
  const commanders = header['Commander'] || [];
  const lieutenants = header['Lieutenants'] || [];
  const dragging = useDeckBuilderDragging();
  const showLieutenants = lieutenants.length > 0 || dragging;
  const badgeFormat: DeckFormat = format === 'commander' || format === 'cube' ? format : 'other';

  let slots: ReactNode = null;
  if (format === 'commander') {
    slots = (
      <div className="db-header-row">
        <div className="db-header-slot is-commander">
          <CommanderSlots
            commanders={commanders}
            selectedId={selectedId}
            selectedIds={selectedIds}
            onSelectCard={onSelectCard}
            onDropCard={onDropCard}
            onCardContextMenu={onCardContextMenu}
            dragging={dragging}
          />
        </div>
        {showLieutenants ? (
          <div className="db-header-slot is-lieutenants">
            <div className="db-header-divider" aria-hidden="true" />
            <DropSection
              category="Lieutenants"
              cards={lieutenants}
              layout="grid"
              selectedId={selectedId}
              selectedIds={selectedIds}
              onSelectCard={onSelectCard}
              onDropCard={onDropCard}
              onCardContextMenu={onCardContextMenu}
              onEditCategory={onEditCategory}
              variant="header"
              cardSort={cardSort}
              swapInIds={swapInIds}
            />
          </div>
        ) : null}
      </div>
    );
  } else if (headerKeys.length) {
    slots = (
      <div className="db-header-row">
        {headerKeys.map((cat, idx) => (
          <div
            key={cat}
            className={`db-header-slot${cat === 'Lieutenants' ? ' is-lieutenants' : ' is-commander'}`}
          >
            {idx > 0 ? <div className="db-header-divider" aria-hidden="true" /> : null}
            <DropSection
              category={cat}
              cards={header[cat] || []}
              layout="grid"
              selectedId={selectedId}
              selectedIds={selectedIds}
              onSelectCard={onSelectCard}
              onDropCard={onDropCard}
              onCardContextMenu={onCardContextMenu}
              onEditCategory={onEditCategory}
              variant="header"
              cardSort={cardSort}
              swapInIds={swapInIds}
            />
          </div>
        ))}
      </div>
    );
  }

  if (!deckName && !slots) return null;

  return (
    <div className="db-deck-leaders" aria-label="Deck leaders">
      {deckName ? (
        <div className="db-deck-leaders-identity">
          <h2 className="db-header-title">
            <FormatBadge format={badgeFormat} />
            <span>{deckName}</span>
          </h2>
          {deckMeta ? (
            <p className={`db-meta${deckMetaWarn ? ' is-warn' : ''}`}>{deckMeta}</p>
          ) : null}
        </div>
      ) : null}
      {slots}
    </div>
  );
}

export function CategoryBrowse({
  deck,
  onSelectCard,
  selectedId,
  selectedIds,
  layout = 'stacked',
  cardSort = 'name_asc',
  onDropCard,
  onCardContextMenu,
  onEditCategory,
  onVisibleOrderChange,
  mode = 'main',
  includeSwapCategories = false,
  deckMeta,
  deckMetaWarn,
  browseView = 'category',
}: {
  deck:
    | Pick<DeckDocument, 'cards' | 'categories' | 'format' | 'oracle' | 'name' | 'formalSwapEntries'>
    | {
        cards: CardView[];
        categories: CategoryDef[];
        format?: DeckFormat;
        oracle?: DeckDocument['oracle'];
        name?: string;
        formalSwapEntries?: FormalSwapEntry[];
      };
  onSelectCard?: SelectCardHandler;
  selectedId?: string | null;
  selectedIds?: ReadonlySet<string> | null;
  layout?: CardLayout;
  cardSort?: CardSortMode;
  onDropCard?: DropCardHandler;
  onCardContextMenu?: CardContextMenuHandler;
  onEditCategory?: (category: string) => void;
  /** Flattened visible instance ids for shift-click range selection (main mode only). */
  onVisibleOrderChange?: (ids: string[]) => void;
  mode?: 'main' | 'aside';
  includeSwapCategories?: boolean;
  deckMeta?: string;
  deckMetaWarn?: boolean;
  browseView?: BrowseView;
}) {
  const resolved = useMemo(
    () => resolveDeckCards({ cards: deck.cards, oracle: deck.oracle }),
    [deck.cards, deck.oracle],
  );
  const format = ('format' in deck ? deck.format : undefined) || 'other';
  const multi = browseView === 'category_multi';
  const keySort = categoryKeySortFor(browseView, format);
  const swapInIds = useMemo(
    () =>
      formalSwapInIds(
        'formalSwapEntries' in deck ? deck.formalSwapEntries : undefined,
      ),
    [deck],
  );
  const { header, included, excluded, headerKeys, includedKeys, excludedKeys } = useMemo(
    () =>
      partitionCategories(
        { ...deck, cards: resolved },
        { includeSwapCategories, multi, keySort },
      ),
    [deck, resolved, includeSwapCategories, multi, keySort],
  );
  const deckName = 'name' in deck && typeof deck.name === 'string' ? deck.name : undefined;
  const categories = deck.categories || [];
  const dropHandler = multi ? undefined : onDropCard;
  const warnTargets = !multi;

  const visibleOrder = useMemo(() => {
    if (mode === 'aside') {
      return excludedKeys.flatMap((cat) =>
        sortCardsInGroup(excluded[cat] || [], cardSort, undefined, swapInIds).map(
          (c) => c.instanceId,
        ),
      );
    }
    const headerIds = headerKeys.flatMap((cat) => {
      if (format === 'commander' && cat === 'Commander') {
        return (header[cat] || []).map((c) => c.instanceId);
      }
      return sortCardsInGroup(header[cat] || [], cardSort, undefined, swapInIds).map(
        (c) => c.instanceId,
      );
    });
    const bodyIds = includedKeys.flatMap((cat) =>
      sortCardsInGroup(included[cat] || [], cardSort, undefined, swapInIds).map(
        (c) => c.instanceId,
      ),
    );
    return [...headerIds, ...bodyIds];
  }, [
    mode,
    excludedKeys,
    excluded,
    headerKeys,
    header,
    includedKeys,
    included,
    cardSort,
    format,
    swapInIds,
  ]);

  useEffect(() => {
    if (mode !== 'main' || !onVisibleOrderChange) return;
    onVisibleOrderChange(visibleOrder);
  }, [mode, onVisibleOrderChange, visibleOrder]);

  if (mode === 'aside') {
    if (!excludedKeys.length) return null;
    return (
      <div className="db-browse db-browse-aside">
        {excludedKeys.map((cat) => (
          <DropSection
            key={cat}
            category={cat}
            cards={excluded[cat]}
            layout={layout}
            selectedId={selectedId}
            selectedIds={selectedIds}
            onSelectCard={onSelectCard}
            onDropCard={dropHandler}
            onCardContextMenu={onCardContextMenu}
            onEditCategory={onEditCategory}
            variant="column"
            cardSort={cardSort}
            target={categoryTarget(categories, cat)}
            primaryCount={primaryCategoryCount(resolved, cat)}
            warnTarget={warnTargets}
            swapInIds={swapInIds}
          />
        ))}
      </div>
    );
  }

  const includedSection = (cat: string) => (
    <DropSection
      key={cat}
      category={cat}
      cards={included[cat]}
      layout={layout}
      selectedId={selectedId}
      selectedIds={selectedIds}
      onSelectCard={onSelectCard}
      onDropCard={dropHandler}
      onCardContextMenu={onCardContextMenu}
      onEditCategory={onEditCategory}
      variant={layout === 'grid' ? 'section' : 'column'}
      cardSort={cardSort}
      target={categoryTarget(categories, cat)}
      primaryCount={primaryCategoryCount(resolved, cat)}
      warnTarget={warnTargets}
      swapInIds={swapInIds}
    />
  );

  const body =
    keySort === 'cube_ci' ? (
      <div className="db-cube-bands">
        {groupKeysByCubeCategoryBand(includedKeys).map((group, index) => (
          <div key={group.band} className="db-cube-band">
            {index > 0 ? (
              <div className="db-cube-band-divider" role="separator" aria-hidden="true" />
            ) : null}
            {layout === 'grid' ? (
              <div className="db-cube-band-grid">{group.keys.map(includedSection)}</div>
            ) : (
              <MasonryColumns>{group.keys.map(includedSection)}</MasonryColumns>
            )}
          </div>
        ))}
      </div>
    ) : layout === 'grid' ? (
      includedKeys.map(includedSection)
    ) : (
      <MasonryColumns>{includedKeys.map(includedSection)}</MasonryColumns>
    );

  return (
    <div className="db-browse">
      <DeckHeaderRow
        header={header}
        headerKeys={headerKeys}
        selectedId={selectedId}
        selectedIds={selectedIds}
        onSelectCard={onSelectCard}
        onDropCard={dropHandler}
        onCardContextMenu={onCardContextMenu}
        onEditCategory={onEditCategory}
        format={format}
        cardSort={cardSort}
        deckName={deckName}
        deckMeta={deckMeta}
        deckMetaWarn={deckMetaWarn}
        swapInIds={swapInIds}
      />
      {body}
    </div>
  );
}
