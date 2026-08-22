import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import {
  deckOwnership,
  deckVisibility,
  isPrivateDeck,
  pickCommanderLeaders,
  partitionCategories,
  resolveDeckCards,
  sortCardsInGroup,
  cardDisplayName,
  categoryPlaceholderCount,
  categoryTarget,
  formalSwapInIds,
  isSeekingCategory,
  isTheoryDeck,
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
  type DeckVisibility,
  type FormalSwapEntry,
  categoryKeySortFor,
  DECK_DESCRIPTION_SPLIT_MIN_REM,
  headerRemainderMode,
  isCommandZoneFormat,
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
import { DeckDescriptionField } from './DeckDescriptionField';
import { MasonryColumns } from './MasonryColumns';
import { useDeckBuilderHeaderDragHover } from './useDeckBuilderDragging';

function cssLengthPx(value: string, fallback: number): number {
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  const n = parseFloat(trimmed);
  if (!Number.isFinite(n)) return fallback;
  if (trimmed.endsWith('rem')) {
    const root = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    return n * root;
  }
  return n;
}

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
    title?: string;
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
            title={sectionAction.title}
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
  dropCategory = 'Commander',
  emptyLabel = 'Drop commander',
  onPickSlot,
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
  dropCategory?: string;
  emptyLabel?: string;
  onPickSlot?: () => void;
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
        const ids = readDragInstanceIds(e.dataTransfer);
        const id = ids[0];
        if (id) onDropCard([id], dropCategory, dropCategory === 'Commander' ? { commanderSlot: slot } : undefined);
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
      ) : onPickSlot ? (
        <button
          type="button"
          className="db-commander-slot-empty"
          aria-label={emptyLabel}
          onClick={onPickSlot}
        >
          {emptyLabel}
        </button>
      ) : (
        <span className="db-commander-slot-placeholder">{emptyLabel}</span>
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
  onPickSlot,
}: {
  commanders: CardView[];
  coverInstanceId?: string | null;
  selectedId?: string | null;
  selectedIds?: ReadonlySet<string> | null;
  onSelectCard?: SelectCardHandler;
  onDropCard?: DropCardHandler;
  onCardContextMenu?: CardContextMenuHandler;
  onPickSlot?: (category: string) => void;
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
          emptyLabel={!slot0 && onPickSlot ? 'Choose commander' : 'Drop commander'}
          onPickSlot={!slot0 && onPickSlot ? () => onPickSlot('Commander') : undefined}
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
              emptyLabel="Drop commander"
            />
          </>
        ) : null}
      </div>
    </div>
  );
}

function PendragonSlots({
  arthur,
  excalibur,
  selectedId,
  selectedIds,
  onSelectCard,
  onDropCard,
  onCardContextMenu,
  onPickSlot,
}: {
  arthur: CardView | null;
  excalibur: CardView | null;
  selectedId?: string | null;
  selectedIds?: ReadonlySet<string> | null;
  onSelectCard?: SelectCardHandler;
  onDropCard?: DropCardHandler;
  onCardContextMenu?: CardContextMenuHandler;
  onPickSlot?: (category: string) => void;
}) {
  const canDrop = Boolean(onDropCard);
  return (
    <div className="db-partner-pair" aria-label="Arthur and Excalibur">
      <h3 className="db-partner-pair-title">Arthur & Excalibur</h3>
      <div className="db-partner-pair-row is-fixed">
        <CommanderSlot
          slot={0}
          card={arthur}
          selectedId={selectedId}
          selectedIds={selectedIds}
          onSelectCard={onSelectCard}
          onDropCard={onDropCard}
          onCardContextMenu={onCardContextMenu}
          draggable={canDrop}
          dropCategory="Arthur"
          emptyLabel="Choose Arthur"
          onPickSlot={!arthur && onPickSlot ? () => onPickSlot('Arthur') : undefined}
        />
        <PartnerTie />
        <CommanderSlot
          slot={1}
          card={excalibur}
          selectedId={selectedId}
          selectedIds={selectedIds}
          onSelectCard={onSelectCard}
          onDropCard={onDropCard}
          onCardContextMenu={onCardContextMenu}
          draggable={canDrop}
          dropCategory="Excalibur"
          emptyLabel="Choose Excalibur"
          onPickSlot={!excalibur && onPickSlot ? () => onPickSlot('Excalibur') : undefined}
        />
      </div>
    </div>
  );
}

function DeckNameControl({
  name,
  onRename,
}: {
  name: string;
  onRename?: (name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);
  const skipBlurCommit = useRef(false);

  useEffect(() => {
    if (!editing) return;
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    el.select();
  }, [editing]);

  if (!onRename) {
    return <span>{name}</span>;
  }

  function commit(raw: string, save: boolean) {
    skipBlurCommit.current = true;
    setEditing(false);
    if (!save) {
      setDraft(name);
      return;
    }
    const next = raw.trim();
      if (!next || next === name) {
        setDraft(name);
        return;
      }
      onRename?.(next);
    }

  function onKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      commit(draft, true);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      commit(draft, false);
    }
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        className="db-header-title-input"
        value={draft}
        aria-label="Deck name"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (skipBlurCommit.current) {
            skipBlurCommit.current = false;
            return;
          }
          commit(draft, true);
        }}
        onKeyDown={onKeyDown}
      />
    );
  }

  return (
    <button
      type="button"
      className="db-header-title-edit"
      title="Rename deck"
      aria-label={`Rename ${name}`}
      onClick={() => {
        skipBlurCommit.current = false;
        setDraft(name);
        setEditing(true);
      }}
    >
      <span className="db-header-title-text">{name}</span>
      <span className="db-section-title-pencil" aria-hidden="true">
        ✎
      </span>
    </button>
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
  visibility,
  onSetVisibility,
  onRename,
  description = '',
  onSetDescription,
  deckMeta,
  deckMetaWarn,
  syncStatus,
  swapInIds,
  coverInstanceId = null,
  onPickSlot,
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
  onPickSlot?: (category: string) => void;
}) {
  const [ownershipMenu, setOwnershipMenu] = useState<DeckOwnershipMenuState | null>(null);
  const [headerTab, setHeaderTab] = useState<'leaders' | 'description'>('leaders');
  const [leftoverPx, setLeftoverPx] = useState(0);
  const [cardWidthPx, setCardWidthPx] = useState(213);
  const [minDescriptionPx, setMinDescriptionPx] = useState(DECK_DESCRIPTION_SPLIT_MIN_REM * 16);
  const leadersRef = useRef<HTMLDivElement>(null);
  const remainderRef = useRef<HTMLDivElement>(null);
  const commanders = header['Commander'] || [];
  const lieutenants = header['Lieutenants'] || [];
  const arthur = (header['Arthur'] || [])[0] ?? null;
  const excalibur = (header['Excalibur'] || [])[0] ?? null;
  const headerDragHover = useDeckBuilderHeaderDragHover(leadersRef);
  const remainderLeaderCount = isCommandZoneFormat(format)
    ? lieutenants.length
    : headerKeys.reduce((n, key) => n + (header[key]?.length || 0), 0);
  const showDescription = Boolean(onSetDescription) || Boolean(description.trim());
  const showRemainderLeaders = remainderLeaderCount > 0 || headerDragHover;
  const needsRemainder = showRemainderLeaders || showDescription;
  const mode = headerRemainderMode({
    leftoverPx,
    leaderCardCount: remainderLeaderCount,
    cardWidthPx,
    minDescriptionPx,
  });
  const useTabs = mode === 'tabs' && remainderLeaderCount > 0 && showDescription;
  const activeTab: 'leaders' | 'description' = headerDragHover ? 'leaders' : headerTab;
  const badgeFormat: DeckFormat =
    format === 'commander' || format === 'cube' || format === 'pendragon' ? format : 'other';
  const resolvedOwnership = deckOwnership({ ownership });
  const theory = resolvedOwnership === 'theory';
  const resolvedVisibility = deckVisibility({ visibility });
  const privateDeck = isPrivateDeck({ visibility: resolvedVisibility });
  const canOpenMenu = Boolean((onSetOwnership || onSetVisibility) && deckId);

  useEffect(() => {
    const el = remainderRef.current;
    if (!el) return;
    function measure() {
      if (!el) return;
      const styles = getComputedStyle(el);
      setCardWidthPx(cssLengthPx(styles.getPropertyValue('--db-card-w'), 213));
      setLeftoverPx(el.clientWidth);
      const root = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      setMinDescriptionPx(DECK_DESCRIPTION_SPLIT_MIN_REM * root);
    }
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [needsRemainder, remainderLeaderCount, useTabs]);

  const dropSection = (category: string, cards: CardView[]) => (
    <DropSection
      category={category}
      cards={cards}
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
  );

  const leaderSections = (contentSized: boolean) => {
    const slotClass = `db-header-slot${contentSized ? ' is-leaders-content' : ' is-lieutenants'}`;
    if (isCommandZoneFormat(format)) {
      return <div className={slotClass}>{dropSection('Lieutenants', lieutenants)}</div>;
    }
    if (!headerKeys.length) return null;
    return headerKeys.map((cat, idx) => (
      <div
        key={cat}
        className={`${slotClass}${cat === 'Lieutenants' ? ' is-lieutenants' : ''}`}
      >
        {idx > 0 ? <div className="db-header-divider" aria-hidden="true" /> : null}
        {dropSection(cat, header[cat] || [])}
      </div>
    ));
  };

  const descriptionField = showDescription ? (
    <DeckDescriptionField value={description} onChange={onSetDescription} />
  ) : null;

  let remainderPane: ReactNode = null;
  if (useTabs) {
    remainderPane = activeTab === 'leaders' ? leaderSections(false) : descriptionField;
  } else if (
    mode === 'split' &&
    remainderLeaderCount > 0 &&
    showDescription &&
    !headerDragHover
  ) {
    remainderPane = (
      <>
        {leaderSections(true)}
        <div className="db-header-divider" aria-hidden="true" />
        {descriptionField}
      </>
    );
  } else if (showRemainderLeaders) {
    remainderPane = leaderSections(false);
  } else {
    remainderPane = descriptionField;
  }

  const hasCommander = format === 'commander';
  const hasPendragon = format === 'pendragon';
  const hasOtherLeaders = format !== 'commander' && format !== 'pendragon' && headerKeys.length > 0;
  const slots =
    hasCommander || hasPendragon || needsRemainder || hasOtherLeaders ? (
      <div className="db-header-row">
        {hasPendragon ? (
          <div className="db-header-slot is-commander">
            <PendragonSlots
              arthur={arthur}
              excalibur={excalibur}
              selectedId={selectedId}
              selectedIds={selectedIds}
              onSelectCard={onSelectCard}
              onDropCard={onDropCard}
              onCardContextMenu={onCardContextMenu}
              onPickSlot={onPickSlot}
            />
          </div>
        ) : null}
        {hasCommander ? (
          <div className="db-header-slot is-commander">
            <CommanderSlots
              commanders={commanders}
              coverInstanceId={coverInstanceId}
              selectedId={selectedId}
              selectedIds={selectedIds}
              onSelectCard={onSelectCard}
              onDropCard={onDropCard}
              onCardContextMenu={onCardContextMenu}
              onPickSlot={onPickSlot}
            />
          </div>
        ) : null}
        {needsRemainder ? (
          <div className="db-header-slot is-remainder" ref={remainderRef}>
            {hasCommander || hasPendragon ? (
              <div className="db-header-divider" aria-hidden="true" />
            ) : null}
            <div className="db-header-remainder" id="db-leaders-panel">{remainderPane}</div>
          </div>
        ) : hasOtherLeaders ? (
          leaderSections(false)
        ) : null}
      </div>
    ) : null;

  if (!deckName && !slots) return null;

  const leadersTabLabel = isCommandZoneFormat(format) ? 'Lieutenants' : 'Leaders';

  return (
    <div className="db-deck-leaders" ref={leadersRef} aria-label="Deck leaders">
      {deckName ? (
        <div className="db-deck-leaders-identity">
          <div className="db-deck-leaders-identity-main">
            <h2
              className="db-header-title"
              onContextMenu={(e) => {
                if (!canOpenMenu || !deckId) return;
                e.preventDefault();
                setOwnershipMenu({
                  x: e.clientX,
                  y: e.clientY,
                  deckId,
                  current: resolvedOwnership,
                  visibility: resolvedVisibility,
                });
              }}
              title={canOpenMenu ? 'Right-click to mark Owned, Theory, Public, or Private' : undefined}
            >
              <FormatBadge format={badgeFormat} />
              {theory ? (
                <span className="db-theory-badge" aria-label="Theory deck">
                  Theory
                </span>
              ) : null}
              {privateDeck ? (
                <span className="db-private-badge" aria-label="Private deck">
                  Private
                </span>
              ) : null}
              <DeckNameControl name={deckName} onRename={onRename} />
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
          {useTabs ? (
            <div className="db-leaders-tabs db-aside-tabs" role="tablist" aria-label="Leaders and description">
              <button
                type="button"
                role="tab"
                id="db-leaders-tab-leaders"
                aria-selected={activeTab === 'leaders'}
                aria-controls="db-leaders-panel"
                className={`db-aside-tab${activeTab === 'leaders' ? ' is-active' : ''}`}
                onClick={() => setHeaderTab('leaders')}
              >
                {leadersTabLabel}
              </button>
              <button
                type="button"
                role="tab"
                id="db-leaders-tab-description"
                aria-selected={activeTab === 'description'}
                aria-controls="db-leaders-panel"
                className={`db-aside-tab${activeTab === 'description' ? ' is-active' : ''}`}
                onClick={() => setHeaderTab('description')}
              >
                Description
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
      {slots}
      {ownershipMenu && (onSetOwnership || onSetVisibility) ? (
        <DeckOwnershipContextMenu
          state={ownershipMenu}
          onClose={() => setOwnershipMenu(null)}
          onSetOwnership={onSetOwnership ? (_id, next) => onSetOwnership(next) : undefined}
          onSetVisibility={onSetVisibility ? (_id, next) => onSetVisibility(next) : undefined}
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
  onSetVisibility,
  onRename,
  onSetDescription,
  onPickSlot,
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
        | 'visibility'
        | 'formalSwapEntries'
        | 'coverInstanceId'
        | 'description'
      >
    | {
        cards: CardView[];
        categories: CategoryDef[];
        format?: DeckFormat;
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
  onCardContextMenu?: CardContextMenuHandler;
  onEditCategory?: (category: string) => void;
  /** Aside Seeking: mark included main-deck cards Seeking as secondary. */
  onMarkMainDeckSeeking?: () => void;
  /** Flattened visible instance ids for shift-click range selection. */
  onVisibleOrderChange?: (ids: string[]) => void;
  onSetOwnership?: (ownership: DeckOwnership) => void;
  onSetVisibility?: (visibility: DeckVisibility) => void;
  onRename?: (name: string) => void;
  onSetDescription?: (description: string) => void;
  onPickSlot?: (category: string) => void;
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
                    title:
                      queuesReadOnly && isTheoryDeck(deck)
                        ? 'Theory decks do not use Seeking queues'
                        : undefined,
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
        onPickSlot={onPickSlot}
        format={format}
        cardSort={cardSort}
        deckName={deckName}
        deckId={'deckId' in deck ? deck.deckId : undefined}
        ownership={'ownership' in deck ? deck.ownership : undefined}
        onSetOwnership={onSetOwnership}
        visibility={'visibility' in deck ? deck.visibility : undefined}
        onSetVisibility={onSetVisibility}
        onRename={onRename}
        description={'description' in deck && typeof deck.description === 'string' ? deck.description : ''}
        onSetDescription={onSetDescription}
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
