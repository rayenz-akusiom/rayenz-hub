import { moveCardCategory, cardDisplayName, type CardView, type DeckDocument } from '@rayenz-hub/shared';

export function MoveSheet({
  deck,
  card,
  onClose,
  onApply,
}: {
  deck: DeckDocument;
  card: CardView | { name: string; primaryCategory: string; instanceId: string; stack?: string | null };
  onClose: () => void;
  onApply: (next: DeckDocument) => void;
}) {
  const categories = [
    ...new Set([
      ...deck.categories.map((c) => c.name),
      ...deck.cards.map((c) => c.primaryCategory),
    ]),
  ].sort();

  return (
    <div className="db-modal" role="dialog" aria-modal="true" aria-label="Move card">
      <div className="db-modal-card">
        <h3>Move {cardDisplayName(card as CardView)}</h3>
        <label>
          Category
          <select
            className="db-select"
            defaultValue={card.primaryCategory}
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
          <input className="db-input" id="db-move-stack" defaultValue={card.stack || ''} />
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
              const cards = moveCardCategory(deck.cards, card.instanceId, cat, stack);
              const categoriesNext = deck.categories.some((c) => c.name === cat)
                ? deck.categories
                : [
                    ...deck.categories,
                    { name: cat, includedInDeck: true, includedInPrice: true },
                  ];
              onApply({
                ...deck,
                cards,
                categories: categoriesNext,
                updatedAt: new Date().toISOString(),
              });
            }}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
