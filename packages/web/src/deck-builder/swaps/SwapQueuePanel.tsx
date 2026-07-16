import { useState } from 'react';
import {
  categoryIncluded,
  incompleteEntryCount,
  isSwapQueueCategory,
  type CardInstance,
  type DeckDocument,
  type FormalSwapEntry,
} from '@rayenz-hub/shared';
import { cardImageUrl } from '@rayenz-hub/shared';
import { SwapCardPicker } from './SwapCardPicker';

function newEntry(sortIndex: number): FormalSwapEntry {
  return {
    id: `swap-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    inInstanceId: null,
    outInstanceId: null,
    inTargetCategory: null,
    sortIndex,
    notes: null,
  };
}

function blockDrag(e: React.DragEvent) {
  e.preventDefault();
  e.stopPropagation();
}

function MiniCard({ card, label }: { card: CardInstance | null; label: string }) {
  if (!card) {
    return (
      <div className="db-swap-mini is-empty" data-label={label}>
        <span className="db-swap-mini-label">{label}</span>
        <span className="db-swap-mini-fallback">—</span>
      </div>
    );
  }
  const src = cardImageUrl(card);
  return (
    <div className="db-swap-mini" data-label={label}>
      <span className="db-swap-mini-label">{label}</span>
      {src ? (
        <img
          src={src}
          alt={card.name}
          className="db-swap-mini-img"
          loading="lazy"
          draggable={false}
          onDragStart={blockDrag}
        />
      ) : (
        <span className="db-swap-mini-fallback">{card.name}</span>
      )}
    </div>
  );
}

function SwapEditSheet({
  deck,
  entry,
  onClose,
  onSave,
  onRemove,
}: {
  deck: DeckDocument;
  entry: FormalSwapEntry;
  onClose: () => void;
  onSave: (patch: Partial<FormalSwapEntry>) => void;
  onRemove: () => void;
}) {
  const [inId, setInId] = useState(entry.inInstanceId);
  const [outId, setOutId] = useState(entry.outInstanceId);
  const [target, setTarget] = useState(entry.inTargetCategory);
  const [notes, setNotes] = useState(entry.notes || '');

  const targetOptions = (deck.categories || [])
    .filter((c) => categoryIncluded(deck.categories, c.name) && !isSwapQueueCategory(c.name))
    .map((c) => c.name)
    .sort((a, b) => a.localeCompare(b));

  return (
    <div className="db-modal" role="dialog" aria-modal="true" aria-label="Edit swap">
      <div className="db-modal-card">
        <h3>Edit swap</h3>
        <label>
          In
          <SwapCardPicker cards={deck.cards} value={inId} onChange={setInId} />
        </label>
        <label>
          Out
          <SwapCardPicker cards={deck.cards} value={outId} onChange={setOutId} />
        </label>
        <label>
          Place In card in category
          <select
            className="db-select"
            value={target || ''}
            onChange={(e) => setTarget(e.target.value || null)}
          >
            <option value="">— not set —</option>
            {targetOptions.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Notes
          <input className="db-input" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        <div className="db-modal-actions">
          <button type="button" className="db-btn db-btn-danger" onClick={onRemove}>
            Remove
          </button>
          <button type="button" className="db-btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="db-btn is-active"
            onClick={() =>
              onSave({
                inInstanceId: inId,
                outInstanceId: outId,
                inTargetCategory: target,
                notes: notes.trim() || null,
              })
            }
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

export function SwapQueuePanel({
  deck,
  onChange,
}: {
  deck: DeckDocument;
  onChange: (next: DeckDocument) => void;
}) {
  const entries = [...deck.formalSwapEntries].sort((a, b) => a.sortIndex - b.sortIndex);
  const incomplete = incompleteEntryCount(entries);
  const [editId, setEditId] = useState<string | null>(null);
  const byId = new Map(deck.cards.map((c) => [c.instanceId, c]));

  function updateEntries(next: FormalSwapEntry[]) {
    onChange({
      ...deck,
      formalSwapEntries: next.map((e, i) => ({ ...e, sortIndex: i })),
      updatedAt: new Date().toISOString(),
    });
  }

  function patch(id: string, patchEntry: Partial<FormalSwapEntry>) {
    updateEntries(entries.map((e) => (e.id === id ? { ...e, ...patchEntry } : e)));
  }

  const editing = editId ? entries.find((e) => e.id === editId) : null;

  return (
    <div className="db-swaps">
      <div className="db-swaps-header">
        <h3>Swap queue</h3>
        <button
          type="button"
          className="db-btn"
          onClick={() => updateEntries([...entries, newEntry(entries.length)])}
        >
          Add
        </button>
      </div>
      {incomplete ? <p className="db-warn">{incomplete} incomplete pairing(s)</p> : null}
      <ul className="db-swap-visual-list">
        {entries.map((entry) => {
          const incompleteEntry = !entry.inInstanceId || !entry.outInstanceId;
          const inCard = entry.inInstanceId ? byId.get(entry.inInstanceId) || null : null;
          const outCard = entry.outInstanceId ? byId.get(entry.outInstanceId) || null : null;
          return (
            <li key={entry.id}>
              <button
                type="button"
                className={`db-swap-pair${incompleteEntry ? ' is-draft' : ''}`}
                onClick={() => setEditId(entry.id)}
                onDragStart={blockDrag}
                title="Click to edit swap"
              >
                <div className="db-swap-pair-stack">
                  <div className="db-swap-pair-out">
                    <MiniCard card={outCard} label="Out" />
                  </div>
                  <div className="db-swap-pair-in">
                    <MiniCard card={inCard} label="In" />
                  </div>
                </div>
                {entry.inTargetCategory ? (
                  <span className="db-swap-target">→ {entry.inTargetCategory}</span>
                ) : (
                  <span className="db-swap-target is-missing">→ category?</span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {!entries.length ? <p className="db-empty">No swap pairings yet.</p> : null}

      {editing ? (
        <SwapEditSheet
          deck={deck}
          entry={editing}
          onClose={() => setEditId(null)}
          onSave={(p) => {
            patch(editing.id, p);
            setEditId(null);
          }}
          onRemove={() => {
            updateEntries(entries.filter((e) => e.id !== editing.id));
            setEditId(null);
          }}
        />
      ) : null}
    </div>
  );
}
