import { useEffect, useMemo, useState } from 'react';
import {
  pickCommanderPair,
  partitionCategories,
  resolveDeckCards,
  sortCardsInGroup,
  cardDisplayName,
  type CardLayout,
  type CardSortMode,
  type CardView,
  type CategoryDef,
  type DeckDocument,
  type DeckFormat,
} from '@rayenz-hub/shared';
import { CardTile, DRAG_MIME } from './CardTile';
import { MasonryColumns } from './MasonryColumns';

export type DropCardHandler = (
  instanceId: string,
  category: string,
  opts?: { commanderSlot?: 0 | 1 },
) => void;

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

export function CardGroup({
  cards,
  layout,
  selectedId,
  onSelectCard,
  draggable,
}: {
  cards: CardView[];
  layout: CardLayout;
  selectedId?: string | null;
  onSelectCard?: (card: CardView) => void;
  draggable?: boolean;
}) {
  if (layout === 'stacked') {
    return (
      <div className="db-card-stack">
        {cards.map((card) => (
          <div key={card.instanceId} className="db-card-stack-item">
            <CardTile
              card={card}
              selected={selectedId === card.instanceId}
              onSelect={onSelectCard}
              draggable={draggable}
            />
            <button
              type="button"
              className="db-card-stack-peek"
              tabIndex={-1}
              aria-hidden="true"
              title={cardDisplayName(card)}
              onClick={() => onSelectCard?.(card)}
            />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="db-card-grid">
      {cards.map((card) => (
        <CardTile
          key={card.instanceId}
          card={card}
          selected={selectedId === card.instanceId}
          onSelect={onSelectCard}
          draggable={draggable}
        />
      ))}
    </div>
  );
}

export function DropSection({
  category,
  cards,
  layout,
  selectedId,
  onSelectCard,
  onDropCard,
  variant = 'section',
  cardSort = 'name_asc',
}: {
  category: string;
  cards: CardView[];
  layout: CardLayout;
  selectedId?: string | null;
  onSelectCard?: (card: CardView) => void;
  onDropCard?: DropCardHandler;
  variant?: 'section' | 'header' | 'column';
  cardSort?: CardSortMode;
}) {
  const [dragOver, setDragOver] = useState(false);
  const canDrop = Boolean(onDropCard);
  const base =
    variant === 'header' ? 'db-header-cat' : variant === 'column' ? 'db-cat-column' : 'db-section';
  const sorted = useMemo(() => sortCardsInGroup(cards, cardSort), [cards, cardSort]);

  return (
    <section
      className={`${base}${dragOver ? ' is-drop-target' : ''}`}
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
      <h3 className={variant === 'header' ? 'db-header-cat-title' : 'db-section-title'}>
        {category} <span className="db-count">({sorted.length})</span>
      </h3>
      <CardGroup
        cards={sorted}
        layout={layout}
        selectedId={selectedId}
        onSelectCard={onSelectCard}
        draggable={canDrop}
      />
    </section>
  );
}

function CommanderSlot({
  slot,
  card,
  selectedId,
  onSelectCard,
  onDropCard,
  draggable,
}: {
  slot: 0 | 1;
  card: CardView | null;
  selectedId?: string | null;
  onSelectCard?: (card: CardView) => void;
  onDropCard?: DropCardHandler;
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
          selected={selectedId === card.instanceId}
          onSelect={onSelectCard}
          draggable={draggable}
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
  onSelectCard,
  onDropCard,
  dragging,
}: {
  commanders: CardView[];
  selectedId?: string | null;
  onSelectCard?: (card: CardView) => void;
  onDropCard?: DropCardHandler;
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
          onSelectCard={onSelectCard}
          onDropCard={onDropCard}
          draggable={canDrop}
        />
        {showSecond ? (
          <>
            {bothFilled ? <PartnerTie illegal={illegal} /> : null}
            <CommanderSlot
              slot={1}
              card={slot1}
              selectedId={selectedId}
              onSelectCard={onSelectCard}
              onDropCard={onDropCard}
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
  onSelectCard,
  onDropCard,
  format,
  cardSort = 'name_asc',
}: {
  header: Record<string, CardView[]>;
  headerKeys: string[];
  selectedId?: string | null;
  onSelectCard?: (card: CardView) => void;
  onDropCard?: DropCardHandler;
  format?: DeckFormat | null;
  cardSort?: CardSortMode;
}) {
  const commanders = header['Commander'] || [];
  const lieutenants = header['Lieutenants'] || [];
  const dragging = useDeckBuilderDragging();
  const showLieutenants = lieutenants.length > 0 || dragging;

  if (format === 'commander') {
    return (
      <div className="db-deck-leaders" aria-label="Deck leaders">
        <div className="db-header-row">
          <div className="db-header-slot is-commander">
            <CommanderSlots
              commanders={commanders}
              selectedId={selectedId}
              onSelectCard={onSelectCard}
              onDropCard={onDropCard}
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
                onSelectCard={onSelectCard}
                onDropCard={onDropCard}
                variant="header"
                cardSort={cardSort}
              />
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  if (!headerKeys.length) return null;

  return (
    <div className="db-deck-leaders" aria-label="Deck leaders">
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
              onSelectCard={onSelectCard}
              onDropCard={onDropCard}
              variant="header"
              cardSort={cardSort}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

export function CategoryBrowse({
  deck,
  onSelectCard,
  selectedId,
  layout = 'stacked',
  cardSort = 'name_asc',
  onDropCard,
  mode = 'main',
  includeSwapCategories = false,
}: {
  deck:
    | Pick<DeckDocument, 'cards' | 'categories' | 'format' | 'oracle'>
    | { cards: CardView[]; categories: CategoryDef[]; format?: DeckFormat; oracle?: DeckDocument['oracle'] };
  onSelectCard?: (card: CardView) => void;
  selectedId?: string | null;
  layout?: CardLayout;
  cardSort?: CardSortMode;
  onDropCard?: DropCardHandler;
  mode?: 'main' | 'aside';
  includeSwapCategories?: boolean;
}) {
  const resolved = useMemo(
    () => resolveDeckCards({ cards: deck.cards, oracle: deck.oracle }),
    [deck.cards, deck.oracle],
  );
  const { header, included, excluded, headerKeys, includedKeys, excludedKeys } = useMemo(
    () => partitionCategories({ ...deck, cards: resolved }, { includeSwapCategories }),
    [deck, resolved, includeSwapCategories],
  );
  const format = 'format' in deck ? deck.format : undefined;

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
            onSelectCard={onSelectCard}
            onDropCard={onDropCard}
            variant="column"
            cardSort={cardSort}
          />
        ))}
      </div>
    );
  }

  const includedSections = includedKeys.map((cat) => (
    <DropSection
      key={cat}
      category={cat}
      cards={included[cat]}
      layout={layout}
      selectedId={selectedId}
      onSelectCard={onSelectCard}
      onDropCard={onDropCard}
      variant={layout === 'grid' ? 'section' : 'column'}
      cardSort={cardSort}
    />
  ));

  return (
    <div className="db-browse">
      <DeckHeaderRow
        header={header}
        headerKeys={headerKeys}
        selectedId={selectedId}
        onSelectCard={onSelectCard}
        onDropCard={onDropCard}
        format={format}
        cardSort={cardSort}
      />
      {layout === 'grid' ? (
        includedSections
      ) : (
        <MasonryColumns>{includedSections}</MasonryColumns>
      )}
    </div>
  );
}
