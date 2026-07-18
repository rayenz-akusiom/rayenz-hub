import { useState } from 'react';
import {
  canonicalizeCategoryName,
  moveCardsCategory,
  cardDisplayName,
  type CardView,
  type DeckDocument,
} from '@rayenz-hub/shared';

const NEW_CATEGORY_VALUE = '__new__';

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

  const [category, setCategory] = useState(defaultCategory);
  const [creatingNew, setCreatingNew] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const [stack, setStack] = useState(defaultStack);

  function resolvedCategory(): string {
    if (creatingNew) {
      return canonicalizeCategoryName(newCategory.trim());
    }
    return category;
  }

  function apply() {
    const cat = resolvedCategory();
    if (!cat) return;
    onApply(
      moveCardsCategory(
        deck,
        list.map((c) => c.instanceId),
        cat,
        stack.trim() || null,
      ),
    );
  }

  return (
    <div className="db-modal" role="dialog" aria-modal="true" aria-label="Move card">
      <div className="db-modal-card">
        <h3>{title}</h3>
        {creatingNew ? (
          <label>
            New category
            <input
              className="db-input"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              placeholder="Category name"
              aria-label="New category name"
              autoFocus
            />
          </label>
        ) : (
          <label>
            Category
            <select
              className="db-select"
              value={category}
              aria-label="Category"
              onChange={(e) => {
                if (e.target.value === NEW_CATEGORY_VALUE) {
                  setCreatingNew(true);
                  return;
                }
                setCategory(e.target.value);
              }}
            >
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
              <option value={NEW_CATEGORY_VALUE}>New category…</option>
            </select>
          </label>
        )}
        <label>
          Stack (optional)
          <input
            className="db-input"
            value={stack}
            onChange={(e) => setStack(e.target.value)}
            aria-label="Stack (optional)"
          />
        </label>
        <div className="db-modal-actions">
          <button type="button" className="db-btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="db-btn is-active"
            disabled={!resolvedCategory()}
            onClick={apply}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
