import {
  COLOUR_IDENTITY_SECTIONS,
  groupByColourIdentity,
  partitionCategories,
  type CardInstance,
  type CardLayout,
  type CategoryDef,
  type DeckDocument,
} from '@rayenz-hub/shared';
import { CardGroup, DeckHeaderRow } from './CategoryBrowse';

export function ColourIdentityBrowse({
  deck,
  onSelectCard,
  selectedId,
  layout = 'stacked',
}: {
  deck: Pick<DeckDocument, 'cards' | 'categories'> | { cards: CardInstance[]; categories: CategoryDef[] };
  onSelectCard?: (card: CardInstance) => void;
  selectedId?: string | null;
  layout?: CardLayout;
}) {
  const { header, headerKeys, included, includedKeys } = partitionCategories(deck);
  const mainCards = includedKeys.flatMap((k) => included[k]);
  const groups = groupByColourIdentity(mainCards);

  const sections = COLOUR_IDENTITY_SECTIONS.map((section) => {
    const list = groups[section];
    if (!list.length) return null;
    return (
      <section
        key={section}
        className={layout === 'stacked' ? 'db-cat-column' : 'db-section'}
      >
        <h3 className="db-section-title">
          {section} <span className="db-count">({list.length})</span>
        </h3>
        <CardGroup
          cards={list}
          layout={layout}
          selectedId={selectedId}
          onSelectCard={onSelectCard}
        />
      </section>
    );
  }).filter(Boolean);

  return (
    <div className="db-browse">
      <DeckHeaderRow
        header={header}
        headerKeys={headerKeys}
        selectedId={selectedId}
        onSelectCard={onSelectCard}
      />
      {layout === 'stacked' ? (
        <div className="db-cat-columns">{sections}</div>
      ) : (
        sections
      )}
    </div>
  );
}
