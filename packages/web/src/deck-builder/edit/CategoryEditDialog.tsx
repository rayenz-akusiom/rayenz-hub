import { useEffect, useState } from 'react';
import {
  applyCategoryTargetWithSeed,
  canonicalizeCategoryName,
  primaryCategoryCount,
  type CategoryDef,
  type DeckDocument,
} from '@rayenz-hub/shared';

export function CategoryEditDialog({
  deck,
  categoryName,
  onChange,
  onClose,
  onOpenReorder,
}: {
  deck: DeckDocument;
  categoryName: string;
  onChange: (next: DeckDocument) => void;
  onClose: () => void;
  onOpenReorder: () => void;
}) {
  const def =
    (deck.categories || []).find(
      (c) => canonicalizeCategoryName(c.name) === canonicalizeCategoryName(categoryName),
    ) || null;
  const [name, setName] = useState(def?.name || categoryName);
  const [targetRaw, setTargetRaw] = useState(
    def?.target != null ? String(def.target) : '',
  );
  const [includedInDeck, setIncludedInDeck] = useState(def?.includedInDeck !== false);

  useEffect(() => {
    setName(def?.name || categoryName);
    setTargetRaw(def?.target != null ? String(def.target) : '');
    setIncludedInDeck(def?.includedInDeck !== false);
  }, [categoryName, def?.name, def?.target, def?.includedInDeck]);

  const n = primaryCategoryCount(deck.cards, def?.name || categoryName);
  const preservedIncludedInPrice = def ? def.includedInPrice !== false : true;

  function persistCategories(nextCategories: CategoryDef[], cards?: DeckDocument['cards']) {
    onChange({
      ...deck,
      categories: nextCategories,
      ...(cards ? { cards } : {}),
      updatedAt: new Date().toISOString(),
    });
  }

  function save() {
    const oldName = def?.name || categoryName;
    const nextName = canonicalizeCategoryName(name.trim()) || oldName;
    if (
      nextName !== oldName &&
      (deck.categories || []).some(
        (c) =>
          canonicalizeCategoryName(c.name) === nextName &&
          canonicalizeCategoryName(c.name) !== canonicalizeCategoryName(oldName),
      )
    ) {
      return;
    }

    let categories = [...(deck.categories || [])];
    if (!def) {
      categories.push({
        name: nextName,
        includedInDeck,
        includedInPrice: preservedIncludedInPrice,
        target: null,
      });
    } else {
      categories = categories.map((c) =>
        canonicalizeCategoryName(c.name) === canonicalizeCategoryName(oldName)
          ? {
              ...c,
              name: nextName,
              includedInDeck,
              includedInPrice: preservedIncludedInPrice,
            }
          : c,
      );
    }

    let cards = deck.cards;
    if (nextName !== oldName) {
      cards = deck.cards.map((card) => {
        const primaryCategory =
          card.primaryCategory === oldName ||
          canonicalizeCategoryName(card.primaryCategory) === canonicalizeCategoryName(oldName)
            ? nextName
            : card.primaryCategory;
        const cardCats = (card.categories || []).map((c) =>
          c === oldName || canonicalizeCategoryName(c) === canonicalizeCategoryName(oldName)
            ? nextName
            : c,
        );
        return { ...card, primaryCategory, categories: cardCats };
      });
    }

    const withMeta = {
      ...deck,
      categories,
      cards,
    };
    const trimmed = targetRaw.trim();
    const target = trimmed === '' ? null : Math.max(0, Math.floor(Number(trimmed)));
    if (trimmed !== '' && !Number.isFinite(target)) return;
    const seeded = applyCategoryTargetWithSeed(withMeta, nextName, target);
    persistCategories(seeded, cards);
    onClose();
  }

  return (
    <div className="db-modal" role="dialog" aria-modal="true" aria-label={`Edit ${categoryName}`}>
      <div className="db-modal-card db-category-edit">
        <div className="db-picker-header">
          <h3>Edit category</h3>
          <button type="button" className="db-btn" onClick={onClose}>
            Close
          </button>
        </div>

        <label className="db-category-edit-field">
          Name
          <input
            className="db-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label="Category name"
          />
        </label>

        <div className="db-category-edit-target-row">
          <label className="db-category-edit-field db-category-edit-target">
            Target
            <input
              className="db-input"
              type="number"
              min={0}
              placeholder="—"
              value={targetRaw}
              onChange={(e) => setTargetRaw(e.target.value)}
              aria-label={`Target for ${categoryName}`}
            />
          </label>
          <button
            type="button"
            className="db-category-edit-current"
            onClick={() => setTargetRaw(String(n))}
            aria-label={`Set target to ${n} cards`}
            title="Set target to current card count"
          >
            Current: {n}
          </button>
        </div>

        <label className="db-check db-category-edit-included">
          <input
            type="checkbox"
            checked={includedInDeck}
            onChange={(e) => setIncludedInDeck(e.target.checked)}
          />
          Included in deck
        </label>

        <div className="db-modal-actions db-category-edit-actions">
          <button
            type="button"
            className="db-btn"
            onClick={() => {
              onClose();
              onOpenReorder();
            }}
          >
            Reorder categories…
          </button>
          <div className="db-category-edit-actions-end">
            <button type="button" className="db-btn" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="db-btn is-active" onClick={save}>
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
