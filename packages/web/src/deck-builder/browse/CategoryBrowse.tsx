import {
  useEffect,
  useMemo,
  useState,
  type DragEvent as ReactDragEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import {
  deckOwnership,
  pickCommanderLeaders,
  partitionCategories,
  resolveDeckCards,
  sortCardsInGroup,
  cardDisplayName,
  categoryPlaceholderCount,
  categoryTarget,
  formalSwapInIds,
  isSeekingCategory,
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
  type DeckOwnership,
  type FormalSwapEntry,
  categoryKeySortFor,
} from '@rayenz-hub/shared';
import { FormatBadge } from '../ui/FormatBadge';
import { SyncStatusCharm, type DeckSyncStatus } from '../ui/SyncStatusCharm';
import {
  DeckOwnershipContextMenu,
  type DeckOwnershipMenuState,
} from '../library/DeckOwnershipContextMenu';
import {
  CardTile,
  isDeckBuilderDragTypes,
  readDragInstanceIds,
  type SelectCardHandler,
} from './CardTile';
import { MasonryColumns } from './MasonryColumns';
import { useDeckBuilderDragging } from './useDeckBuilderDragging';

export type DropCardHandler = (
  instanceIds: string[],
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
              selectedIds={selectedIds}
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
          selectedIds={selectedIds}
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
  sectionAction,
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
  /** Optional action under the section title (e.g. Seeking “Mark main deck”). */
  sectionAction?: {
    label: string;
    onClick: () => void;
    ariaLabel?: string;
    disabled?: boolean;
  };
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
        const ids = readDragInstanceIds(e.dataTransfer);
        if (ids.length) onDropCard?.(ids, category);
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
          <span className="db-section-title-text">{category}</span>
          <span className="db-count">{countLabel}</span>
          <span className="db-section-title-pencil" aria-hidden="true">
            ✎
          </span>
        </button>
      ) : (
        <h3
          className={`${titleClass}${mismatch ? ' is-target-warn' : ''}`}
          title={category}
        >
          <span className="db-section-title-text">{category}</span>{' '}
          <span className="db-count">{countLabel}</span>
        </h3>
      )}
      {sectionAction ? (
        <div className="db-section-actions">
          <button
            type="button"
            className="db-btn db-section-action"
            onClick={sectionAction.onClick}
            aria-label={sectionAction.ariaLabel || sectionAction.label}
            disabled={sectionAction.disabled}
            title={
              sectionAction.disabled
                ? 'Theory decks do not use Seeking queues'
                : undefined
            }
          >
            {sectionAction.label}
          </button>
        </div>
      ) : null}
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
  isPrimary = false,
}: {
  slot: 0 | 1;
  card: CardView | null;
  selectedId?: string | null;
  selectedIds?: ReadonlySet<string> | null;
  onSelectCard?: SelectCardHandler;
  onDropCard?: DropCardHandler;
  onCardContextMenu?: CardContextMenuHandler;
  draggable?: boolean;
  isPrimary?: boolean;
}) {
  const [dragOver, setDragOver] = useState(false);
  const canDrop = Boolean(onDropCard);

  return (
    <div
      className={`db-commander-slot${card ? '' : ' is-empty'}${dragOver ? ' is-drop-target' : ''}${isPrimary ? ' is-primary' : ''}`}
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
        // Commander slots always take the primary dragged card only.
        const ids = readDragInstanceIds(e.dataTransfer);
        const id = ids[0];
        if (id) onDropCard([id], 'Commander', { commanderSlot: slot });
      }}
    >
      {card ? (
        <>
          {isPrimary ? (
            <span className="db-commander-primary-badge" title="Primary">
              Primary
            </span>
          ) : null}
          <CardTile
            card={card}
            selected={cardIsSelected(card.instanceId, selectedIds, selectedId)}
            selectedIds={selectedIds}
            onSelect={onSelectCard}
            draggable={draggable}
            onContextMenu={onCardContextMenu}
          />
        </>
      ) : (
        <span className="db-commander-slot-placeholder">Drop commander</span>
      )}
    </div>
  );
}

function CommanderGalleryFace({
  card,
  isPrimary,
  selectedId,
  selectedIds,
  onSelectCard,
  onCardContextMenu,
  draggable,
}: {
  card: CardView;
  isPrimary: boolean;
  selectedId?: string | null;
  selectedIds?: ReadonlySet<string> | null;
  onSelectCard?: SelectCardHandler;
  onCardContextMenu?: CardContextMenuHandler;
  draggable?: boolean;
}) {
  return (
    <div className={`db-commander-slot${isPrimary ? ' is-primary' : ''}`}>
      {isPrimary ? (
        <span className="db-commander-primary-badge" title="Primary">
          Primary
        </span>
      ) : null}
      <CardTile
        card={card}
        selected={cardIsSelected(card.instanceId, selectedIds, selectedId)}
        selectedIds={selectedIds}
        onSelect={onSelectCard}
        draggable={draggable}
        onContextMenu={onCardContextMenu}
      />
    </div>
  );
}

function CommanderSlots({
  commanders,
  coverInstanceId,
  selectedId,
  selectedIds,
  onSelectCard,
  onDropCard,
  onCardContextMenu,
}: {
  commanders: CardView[];
  coverInstanceId?: string | null;
  selectedId?: string | null;
  selectedIds?: ReadonlySet<string> | null;
  onSelectCard?: SelectCardHandler;
  onDropCard?: DropCardHandler;
  onCardContextMenu?: CardContextMenuHandler;
}) {
  const canDrop = Boolean(onDropCard);
  const leaders = pickCommanderLeaders(commanders, coverInstanceId);
  /** Empty partner slot only while a deck-builder drag is over this row (not on global dragstart). */
  const [partnerDropArmed, setPartnerDropArmed] = useState(false);
  const [galleryDragOver, setGalleryDragOver] = useState(false);

  const canArmPartner =
    leaders.kind === 'none' || leaders.kind === 'single' || leaders.kind === 'gallery';
  const showPartnerSlot =
    leaders.kind === 'partner' ||
    (canArmPartner && partnerDropArmed && leaders.kind !== 'none');

  const illegal = leaders.kind === 'partner' && leaders.partnerStatus === 'illegal';

  useEffect(() => {
    function clearArmed() {
      setPartnerDropArmed(false);
      setGalleryDragOver(false);
    }
    document.addEventListener('dragend', clearArmed);
    document.addEventListener('drop', clearArmed);
    return () => {
      document.removeEventListener('dragend', clearArmed);
      document.removeEventListener('drop', clearArmed);
    };
  }, []);

  function armPartnerDrop(e: ReactDragEvent) {
    if (!canDrop || !canArmPartner) return;
    if (leaders.kind === 'none') return;
    if (!isDeckBuilderDragTypes(e.dataTransfer.types)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setPartnerDropArmed(true);
  }

  function onGalleryDragOver(e: ReactDragEvent) {
    if (!canDrop) return;
    if (!isDeckBuilderDragTypes(e.dataTransfer.types)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setGalleryDragOver(true);
  }

  function onGalleryDrop(e: ReactDragEvent) {
    if (!onDropCard) return;
    e.preventDefault();
    setGalleryDragOver(false);
    const ids = readDragInstanceIds(e.dataTransfer);
    const id = ids[0];
    if (id) onDropCard([id], 'Commander');
  }

  const titleCount = commanders.length;
  const title =
    leaders.kind === 'gallery'
      ? 'Commander'
      : `Commander${titleCount !== 1 ? 's' : ''}`;

  if (leaders.kind === 'gallery') {
    const group = leaders.groups[0]!;
    const primaryId = group.primary.instanceId;
    return (
      <div
        className={`db-partner-pair is-gallery${galleryDragOver ? ' is-drop-target' : ''}`}
        aria-label="Commander printings"
        onDragEnter={onGalleryDragOver}
        onDragOver={(e) => {
          onGalleryDragOver(e);
          armPartnerDrop(e);
        }}
        onDragLeave={() => setGalleryDragOver(false)}
        onDrop={onGalleryDrop}
      >
        <h3 className="db-partner-pair-title">
          {title} <span className="db-count">({titleCount})</span>
        </h3>
        <div className="db-partner-pair-row db-commander-gallery">
          {group.cards.map((card) => (
            <CommanderGalleryFace
              key={card.instanceId}
              card={card}
              isPrimary={card.instanceId === primaryId}
              selectedId={selectedId}
              selectedIds={selectedIds}
              onSelectCard={onSelectCard}
              onCardContextMenu={onCardContextMenu}
              draggable={canDrop}
            />
          ))}
          {showPartnerSlot ? (
            <>
              <PartnerTie />
              <CommanderSlot
                slot={1}
                card={null}
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
      </div>
    );
  }

  if (leaders.kind === 'partner') {
    const [groupA, groupB] = leaders.groups;
    return (
      <div
        className={`db-partner-pair${illegal ? ' is-illegal' : ''}`}
        aria-label={illegal ? 'Commanders (illegal partner pair)' : 'Commanders'}
      >
        <h3 className="db-partner-pair-title">
          Commanders <span className="db-count">({titleCount})</span>
        </h3>
        <div className="db-partner-pair-row">
          <div className="db-partner-pair-slot db-commander-side">
            <CommanderSlot
              slot={0}
              card={groupA.primary}
              isPrimary={groupA.cards.length > 1}
              selectedId={selectedId}
              selectedIds={selectedIds}
              onSelectCard={onSelectCard}
              onDropCard={onDropCard}
              onCardContextMenu={onCardContextMenu}
              draggable={canDrop}
            />
            {groupA.cards.length > 1 ? (
              <div className="db-commander-side-gallery" aria-label={`${groupA.name} printings`}>
                {groupA.cards
                  .filter((c) => c.instanceId !== groupA.primary.instanceId)
                  .map((card) => (
                    <CommanderGalleryFace
                      key={card.instanceId}
                      card={card}
                      isPrimary={false}
                      selectedId={selectedId}
                      selectedIds={selectedIds}
                      onSelectCard={onSelectCard}
                      onCardContextMenu={onCardContextMenu}
                      draggable={canDrop}
                    />
                  ))}
              </div>
            ) : null}
          </div>
          <PartnerTie illegal={illegal} />
          <div className="db-partner-pair-slot db-commander-side">
            <CommanderSlot
              slot={1}
              card={groupB.primary}
              isPrimary={groupB.cards.length > 1}
              selectedId={selectedId}
              selectedIds={selectedIds}
              onSelectCard={onSelectCard}
              onDropCard={onDropCard}
              onCardContextMenu={onCardContextMenu}
              draggable={canDrop}
            />
            {groupB.cards.length > 1 ? (
              <div className="db-commander-side-gallery" aria-label={`${groupB.name} printings`}>
                {groupB.cards
                  .filter((c) => c.instanceId !== groupB.primary.instanceId)
                  .map((card) => (
                    <CommanderGalleryFace
                      key={card.instanceId}
                      card={card}
                      isPrimary={false}
                      selectedId={selectedId}
                      selectedIds={selectedIds}
                      onSelectCard={onSelectCard}
                      onCardContextMenu={onCardContextMenu}
                      draggable={canDrop}
                    />
                  ))}
              </div>
            ) : null}
          </div>
        </div>
        {illegal ? (
          <p className="db-partner-pair-warn" role="status">
            These commanders can’t partner
          </p>
        ) : null}
      </div>
    );
  }

  if (leaders.kind === 'many') {
    return (
      <div
        className={`db-partner-pair is-gallery${galleryDragOver ? ' is-drop-target' : ''}`}
        aria-label="Commanders"
        onDragEnter={onGalleryDragOver}
        onDragOver={onGalleryDragOver}
        onDragLeave={() => setGalleryDragOver(false)}
        onDrop={onGalleryDrop}
      >
        <h3 className="db-partner-pair-title">
          Commanders <span className="db-count">({titleCount})</span>
        </h3>
        <div className="db-partner-pair-row db-commander-gallery">
          {leaders.groups.map((group) => (
            <CommanderGalleryFace
              key={group.nameKey}
              card={group.primary}
              isPrimary={false}
              selectedId={selectedId}
              selectedIds={selectedIds}
              onSelectCard={onSelectCard}
              onCardContextMenu={onCardContextMenu}
              draggable={canDrop}
            />
          ))}
        </div>
      </div>
    );
  }

  // none / single — partner drop slot appears while dragging
  const slot0 = leaders.kind === 'single' ? leaders.primaries[0] : null;
  return (
    <div
      className="db-partner-pair"
      aria-label="Commanders"
      onDragEnter={armPartnerDrop}
      onDragOver={armPartnerDrop}
    >
      <h3 className="db-partner-pair-title">
        {title} <span className="db-count">({titleCount})</span>
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
        {showPartnerSlot ? (
          <>
            {slot0 ? <PartnerTie /> : null}
            <CommanderSlot
              slot={1}
              card={null}
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
  deckId,
  ownership,
  onSetOwnership,
  deckMeta,
  deckMetaWarn,
  syncStatus,
  swapInIds,
  coverInstanceId = null,
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
  deckId?: string;
  ownership?: DeckOwnership;
  onSetOwnership?: (ownership: DeckOwnership) => void;
  deckMeta?: string;
  deckMetaWarn?: boolean;
  syncStatus?: DeckSyncStatus | null;
  swapInIds?: ReadonlySet<string> | null;
  coverInstanceId?: string | null;
}) {
  const [ownershipMenu, setOwnershipMenu] = useState<DeckOwnershipMenuState | null>(null);
  const commanders = header['Commander'] || [];
  const lieutenants = header['Lieutenants'] || [];
  const dragging = useDeckBuilderDragging();
  const showLieutenants = lieutenants.length > 0 || dragging;
  const badgeFormat: DeckFormat = format === 'commander' || format === 'cube' ? format : 'other';
  const resolvedOwnership = deckOwnership({ ownership });
  const theory = resolvedOwnership === 'theory';

  let slots: ReactNode = null;
  if (format === 'commander') {
    slots = (
      <div className="db-header-row">
        <div className="db-header-slot is-commander">
          <CommanderSlots
            commanders={commanders}
            coverInstanceId={coverInstanceId}
            selectedId={selectedId}
            selectedIds={selectedIds}
            onSelectCard={onSelectCard}
            onDropCard={onDropCard}
            onCardContextMenu={onCardContextMenu}
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
          <h2
            className="db-header-title"
            onContextMenu={(e) => {
              if (!onSetOwnership || !deckId) return;
              e.preventDefault();
              setOwnershipMenu({
                x: e.clientX,
                y: e.clientY,
                deckId,
                current: resolvedOwnership,
              });
            }}
            title={onSetOwnership ? 'Right-click to mark Owned or Theory' : undefined}
          >
            <FormatBadge format={badgeFormat} />
            {theory ? (
              <span className="db-theory-badge" aria-label="Theory deck">
                Theory
              </span>
            ) : null}
            <span>{deckName}</span>
          </h2>
          {deckMeta || syncStatus ? (
            <div className="db-meta-row">
              {deckMeta ? (
                <p className={`db-meta${deckMetaWarn ? ' is-warn' : ''}`}>{deckMeta}</p>
              ) : null}
              {syncStatus ? <SyncStatusCharm status={syncStatus} /> : null}
            </div>
          ) : null}
        </div>
      ) : null}
      {slots}
      {ownershipMenu && onSetOwnership ? (
        <DeckOwnershipContextMenu
          state={ownershipMenu}
          onClose={() => setOwnershipMenu(null)}
          onSetOwnership={(_id, next) => onSetOwnership(next)}
        />
      ) : null}
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
  onMarkMainDeckSeeking,
  onVisibleOrderChange,
  onSetOwnership,
  queuesReadOnly = false,
  mode = 'main',
  deckMeta,
  deckMetaWarn,
  syncStatus = null,
  browseView = 'category',
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
        | 'formalSwapEntries'
        | 'coverInstanceId'
      >
    | {
        cards: CardView[];
        categories: CategoryDef[];
        format?: DeckFormat;
        oracle?: DeckDocument['oracle'];
        name?: string;
        deckId?: string;
        ownership?: DeckOwnership;
        formalSwapEntries?: FormalSwapEntry[];
        coverInstanceId?: string | null;
      };
  onSelectCard?: SelectCardHandler;
  selectedId?: string | null;
  selectedIds?: ReadonlySet<string> | null;
  layout?: CardLayout;
  cardSort?: CardSortMode;
  onDropCard?: DropCardHandler;
  onCardContextMenu?: CardContextMenuHandler;
  onEditCategory?: (category: string) => void;
  /** Aside Seeking: mark included main-deck cards Seeking as secondary. */
  onMarkMainDeckSeeking?: () => void;
  /** Flattened visible instance ids for shift-click range selection. */
  onVisibleOrderChange?: (ids: string[]) => void;
  onSetOwnership?: (ownership: DeckOwnership) => void;
  /** Theory decks: Seeking actions stay visible but disabled. */
  queuesReadOnly?: boolean;
  mode?: 'main' | 'aside';
  deckMeta?: string;
  deckMetaWarn?: boolean;
  syncStatus?: DeckSyncStatus | null;
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
        { multi, keySort },
      ),
    [deck, resolved, multi, keySort],
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
    if (!onVisibleOrderChange) return;
    onVisibleOrderChange(visibleOrder);
  }, [onVisibleOrderChange, visibleOrder]);

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
            sectionAction={
              onMarkMainDeckSeeking && isSeekingCategory(cat)
                ? {
                    label: 'Mark main deck',
                    ariaLabel: 'Mark main deck Seeking',
                    onClick: queuesReadOnly ? () => {} : onMarkMainDeckSeeking,
                    disabled: queuesReadOnly,
                  }
                : undefined
            }
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
        deckId={'deckId' in deck ? deck.deckId : undefined}
        ownership={'ownership' in deck ? deck.ownership : undefined}
        onSetOwnership={onSetOwnership}
        deckMeta={deckMeta}
        deckMetaWarn={deckMetaWarn}
        syncStatus={syncStatus}
        swapInIds={swapInIds}
        coverInstanceId={'coverInstanceId' in deck ? deck.coverInstanceId : null}
      />
      {body}
    </div>
  );
}
