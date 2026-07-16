import { useState } from 'react';
import {
  partitionCategories,
  type CardInstance,
  type CardLayout,
  type CategoryDef,
  type DeckDocument,
} from '@rayenz-hub/shared';
import { CardTile, DRAG_MIME } from './CardTile';
import { MasonryColumns } from './MasonryColumns';

export function CardGroup({
  cards,
  layout,
  selectedId,
  onSelectCard,
  draggable,
}: {
  cards: CardInstance[];
  layout: CardLayout;
  selectedId?: string | null;
  onSelectCard?: (card: CardInstance) => void;
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
              title={card.name}
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
}: {
  category: string;
  cards: CardInstance[];
  layout: CardLayout;
  selectedId?: string | null;
  onSelectCard?: (card: CardInstance) => void;
  onDropCard?: (instanceId: string, category: string) => void;
  variant?: 'section' | 'header' | 'column';
}) {
  const [dragOver, setDragOver] = useState(false);
  const canDrop = Boolean(onDropCard);
  const base =
    variant === 'header' ? 'db-header-cat' : variant === 'column' ? 'db-cat-column' : 'db-section';

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
        {category} <span className="db-count">({cards.length})</span>
      </h3>
      <CardGroup
        cards={cards}
        layout={layout}
        selectedId={selectedId}
        onSelectCard={onSelectCard}
        draggable={canDrop}
      />
    </section>
  );
}

export function DeckHeaderRow({
  header,
  headerKeys,
  selectedId,
  onSelectCard,
  onDropCard,
}: {
  header: Record<string, CardInstance[]>;
  headerKeys: string[];
  selectedId?: string | null;
  onSelectCard?: (card: CardInstance) => void;
  onDropCard?: (instanceId: string, category: string) => void;
}) {
  if (!headerKeys.length) return null;
  return (
    <div className="db-header-row" aria-label="Deck headers">
      {headerKeys.map((cat, idx) => (
        <div key={cat} className="db-header-slot">
          {idx > 0 ? <div className="db-header-divider" aria-hidden="true" /> : null}
          <DropSection
            category={cat}
            cards={header[cat]}
            layout="grid"
            selectedId={selectedId}
            onSelectCard={onSelectCard}
            onDropCard={onDropCard}
            variant="header"
          />
        </div>
      ))}
    </div>
  );
}

export function CategoryBrowse({
  deck,
  onSelectCard,
  selectedId,
  layout = 'stacked',
  onDropCard,
  mode = 'main',
  includeSwapCategories = false,
}: {
  deck: Pick<DeckDocument, 'cards' | 'categories'> | { cards: CardInstance[]; categories: CategoryDef[] };
  onSelectCard?: (card: CardInstance) => void;
  selectedId?: string | null;
  layout?: CardLayout;
  onDropCard?: (instanceId: string, category: string) => void;
  mode?: 'main' | 'aside';
  includeSwapCategories?: boolean;
}) {
  const { header, included, excluded, headerKeys, includedKeys, excludedKeys } =
    partitionCategories(deck, { includeSwapCategories });

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
      />
      {layout === 'grid' ? (
        includedSections
      ) : (
        <MasonryColumns>{includedSections}</MasonryColumns>
      )}
    </div>
  );
}
