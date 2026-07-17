import { moveCardsCategory, cardDisplayName, type CardView, type DeckDocument } from '@rayenz-hub/shared';

export function MoveSheet({
  deck,
  cards,
  onClose,
  onApply,
}: {
  deck: DeckDocument;
  /** One or more cards to move to the same category/stack. */
  cards: Array<CardView | { name: string; primaryCategory: string; instanceId: string; stack?: string | null }>;
  onClose: () => void;
  onApply: (next: DeckDocument) => void;
}) {
  const list = cards.filter(Boolean);
  const primary = list[0];
  if (!primary) return null;

  const categories = [
    ...new Set([
      ...deck.categories.map((c) => c.name),
      ...deck.cards.map((c) => c.primaryCategory),
    ]),
  ].sort();

  const title =
    list.length === 1
      ? `Move ${cardDisplayName(primary as CardView)}`
      : `Move ${list.length} cards`;

  const defaultCategory =
    list.length === 1
      ? primary.primaryCategory
      : list.every((c) => c.primaryCategory === primary.primaryCategory)
        ? primary.primaryCategory
        : categories[0] || primary.primaryCategory;

  const defaultStack =
    list.length === 1
      ? primary.stack || ''
      : list.every((c) => (c.stack || '') === (primary.stack || ''))
        ? primary.stack || ''
        : '';

  return (
    <div className="db-modal" role="dialog" aria-modal="true" aria-label="Move card">
      <div className="db-modal-card">
        <h3>{title}</h3>
        <label>
          Category
          <select
            className="db-select"
            defaultValue={defaultCategory}
            id="db-move-cat"
          >
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label>
          Stack (optional)
          <input className="db-input" id="db-move-stack" defaultValue={defaultStack} />
        </label>
        <div className="db-modal-actions">
          <button type="button" className="db-btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="db-btn is-active"
            onClick={() => {
              const cat = (document.getElementById('db-move-cat') as HTMLSelectElement).value;
              const stackRaw = (document.getElementById('db-move-stack') as HTMLInputElement).value;
              const stack = stackRaw.trim() || null;
              onApply(
                moveCardsCategory(
                  deck,
                  list.map((c) => c.instanceId),
                  cat,
                  stack,
                ),
              );
            }}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
