import { EXTRAS_CATEGORY, type CardLayout, type CardView } from '@rayenz-hub/shared';
import { CardGroup } from './CategoryBrowse';

export function ExtrasSection({
  cards,
  layout = 'grid',
}: {
  cards: readonly CardView[];
  layout?: CardLayout;
}) {
  if (!cards.length) return null;
  const sectionClass = layout === 'grid' ? 'db-section' : 'db-cat-column';
  return (
    <section className={sectionClass} data-testid="db-extras-section">
      <h3 className="db-section-title">
        {EXTRAS_CATEGORY} <span className="db-count">({cards.length})</span>
      </h3>
      <CardGroup
        cards={[...cards]}
        layout={layout}
        draggable={false}
        categoryKey={EXTRAS_CATEGORY}
      />
    </section>
  );
}
