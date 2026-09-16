import { EXTRAS_CATEGORY, type CardView } from '@rayenz-hub/shared';
import { CardGroup } from './CategoryBrowse';

export function ExtrasSection({ cards }: { cards: readonly CardView[] }) {
  if (!cards.length) return null;
  return (
    <section className="db-section" data-testid="db-extras-section">
      <h3 className="db-section-title">
        {EXTRAS_CATEGORY} <span className="db-count">({cards.length})</span>
      </h3>
      <CardGroup
        cards={[...cards]}
        layout="grid"
        draggable={false}
        categoryKey={EXTRAS_CATEGORY}
      />
    </section>
  );
}
