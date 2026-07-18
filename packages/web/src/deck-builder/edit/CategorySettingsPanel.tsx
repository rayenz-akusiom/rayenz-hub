import { useMemo, useState, type DragEvent } from 'react';
import {
  canonicalizeCategoryName,
  categoryTargetsMismatchCubeSize,
  reorderCategoryDefs,
  type CategoryDef,
  type DeckDocument,
} from '@rayenz-hub/shared';

export function CategorySettingsPanel({
  deck,
  onChange,
  onClose,
  onEditCategory,
  initialFocus = 'order',
}: {
  deck: DeckDocument;
  onChange: (next: DeckDocument) => void;
  onClose: () => void;
  onEditCategory?: (name: string) => void;
  initialFocus?: 'order' | 'deck';
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const categories = deck.categories || [];
  const cubeMismatch = categoryTargetsMismatchCubeSize(deck);
  const rows = useMemo(() => categories, [categories]);

  function persist(nextCategories: CategoryDef[], cubeTargetSize?: number | null) {
    onChange({
      ...deck,
      categories: nextCategories,
      ...(cubeTargetSize !== undefined ? { cubeTargetSize } : {}),
      updatedAt: new Date().toISOString(),
    });
  }

  function onDragStart(index: number) {
    setDragIndex(index);
  }

  function onDragOver(e: DragEvent, index: number) {
    e.preventDefault();
    if (dragIndex == null || dragIndex === index) return;
    const names = rows.map((c) => c.name);
    const [moved] = names.splice(dragIndex, 1);
    names.splice(index, 0, moved);
    setDragIndex(index);
    persist(reorderCategoryDefs(categories, names));
  }

  function onDragEnd() {
    setDragIndex(null);
  }

  function addCategory() {
    const name = window.prompt('New category name');
    if (!name?.trim()) return;
    const trimmed = canonicalizeCategoryName(name.trim());
    if (categories.some((c) => canonicalizeCategoryName(c.name) === trimmed)) return;
    persist([
      ...categories,
      {
        name: trimmed,
        includedInDeck: true,
        includedInPrice: true,
        target: null,
      },
    ]);
    onEditCategory?.(trimmed);
  }

  return (
    <div className="db-modal" role="dialog" aria-modal="true" aria-label="Deck categories">
      <div className="db-modal-card db-category-settings">
        <div className="db-picker-header">
          <h3>Categories</h3>
          <button type="button" className="db-btn" onClick={onClose}>
            Close
          </button>
        </div>

        <section
          className="db-category-settings-section"
          aria-labelledby="db-cat-order-heading"
          ref={(el) => {
            if (initialFocus === 'order' && el) {
              /* order is default; no scroll needed */
            }
          }}
        >
          <h4 id="db-cat-order-heading">Order</h4>
          <p className="db-meta">
            Drag rows to set Categories (Custom) browse order. New categories append at the end.
            Click a category name to edit targets and inclusion, or click a category title in browse.
          </p>
          <ul className="db-category-reorder-list">
            {rows.map((cat, index) => (
              <li
                key={cat.name}
                className={`db-category-reorder-row${dragIndex === index ? ' is-dragging' : ''}`}
                draggable
                onDragStart={() => onDragStart(index)}
                onDragOver={(e) => onDragOver(e, index)}
                onDragEnd={onDragEnd}
              >
                <span className="db-category-drag-handle" aria-hidden="true">
                  ⋮⋮
                </span>
                <button
                  type="button"
                  className="db-category-reorder-name"
                  onClick={() => onEditCategory?.(cat.name)}
                >
                  {cat.name}
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section
          className="db-category-settings-section"
          aria-labelledby="db-cat-deck-heading"
          id="db-cat-deck-options"
        >
          <h4 id="db-cat-deck-heading">Deck options</h4>
          {deck.format === 'cube' ? (
            <label className="db-category-cube-target">
              Cube target size
              <input
                className="db-input"
                type="number"
                min={1}
                value={deck.cubeTargetSize ?? ''}
                onChange={(e) => {
                  const v = e.target.value.trim();
                  const n = v === '' ? null : Math.max(1, Math.floor(Number(v)));
                  if (v !== '' && !Number.isFinite(n)) return;
                  persist(categories, n);
                }}
              />
            </label>
          ) : null}
          {cubeMismatch ? (
            <p className="db-warn">
              Sum of category targets does not match cube target size ({deck.cubeTargetSize}).
            </p>
          ) : null}
          <div className="db-modal-actions" style={{ justifyContent: 'flex-start' }}>
            <button type="button" className="db-btn" onClick={addCategory}>
              Add category
            </button>
          </div>
        </section>

        <div className="db-modal-actions">
          <button type="button" className="db-btn is-active" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
