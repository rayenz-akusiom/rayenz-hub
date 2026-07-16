import {
  categoryIncluded,
  incompleteEntryCount,
  isSwapQueueCategory,
  type CardInstance,
  type DeckDocument,
  type FormalSwapEntry,
} from '@rayenz-hub/shared';
import { cardImageUrl } from '@rayenz-hub/shared';
import { CardTile } from '../browse/CardTile';
import { CardFace } from '../browse/CardFace';

export type SwapEditDraft = {
  entryId: string;
  inInstanceId: string | null;
  outInstanceId: string | null;
  inTargetCategory: string | null;
  notes: string;
};

export type SwapPickSlot = 'in' | 'out';

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
  const qty = Number(card.quantity) || 1;
  const foil = Boolean(card.foil);
  return (
    <div
      className={`db-swap-mini${foil ? ' is-foil' : ''}${qty > 1 ? ' has-qty' : ''}`}
      data-label={label}
      onDragStart={blockDrag}
    >
      <span className="db-swap-mini-label">{label}</span>
      <CardFace src={src} name={card.name} foil={foil} quantity={qty} />
    </div>
  );
}

function SwapEditSlot({
  card,
  label,
  picking,
  onChange,
}: {
  card: CardInstance | null;
  label: string;
  picking: boolean;
  onChange: () => void;
}) {
  return (
    <div className={`db-swap-edit-slot${picking ? ' is-picking' : ''}`}>
      <span className="db-swap-edit-slot-label">{label}</span>
      {card ? (
        <CardTile card={card} selected={picking} onSelect={() => onChange()} />
      ) : (
        <button type="button" className="db-swap-edit-empty" onClick={onChange}>
          Choose {label}
        </button>
      )}
      <button type="button" className="db-btn" onClick={onChange}>
        Change
      </button>
    </div>
  );
}

function SwapEditChrome({
  deck,
  draft,
  picking,
  onDraftChange,
  onSetPicking,
  onClose,
  onSave,
  onRemove,
}: {
  deck: DeckDocument;
  draft: SwapEditDraft;
  picking: SwapPickSlot | null;
  onDraftChange: (patch: Partial<SwapEditDraft>) => void;
  onSetPicking: (slot: SwapPickSlot | null) => void;
  onClose: () => void;
  onSave: () => void;
  onRemove: () => void;
}) {
  const byId = new Map(deck.cards.map((c) => [c.instanceId, c]));
  const inCard = draft.inInstanceId ? byId.get(draft.inInstanceId) || null : null;
  const outCard = draft.outInstanceId ? byId.get(draft.outInstanceId) || null : null;

  const targetOptions = (deck.categories || [])
    .filter((c) => categoryIncluded(deck.categories, c.name) && !isSwapQueueCategory(c.name))
    .map((c) => c.name)
    .sort((a, b) => a.localeCompare(b));

  return (
    <div
      className={`db-modal${picking ? ' is-picking' : ''}`}
      role="dialog"
      aria-modal={!picking}
      aria-label="Edit swap"
    >
      <div className="db-modal-card db-modal-wide db-swap-edit-chrome">
        <h3>Edit swap</h3>
        <div className="db-swap-edit-slots">
          <SwapEditSlot
            card={outCard}
            label="Out"
            picking={picking === 'out'}
            onChange={() => onSetPicking(picking === 'out' ? null : 'out')}
          />
          <SwapEditSlot
            card={inCard}
            label="In"
            picking={picking === 'in'}
            onChange={() => onSetPicking(picking === 'in' ? null : 'in')}
          />
        </div>
        <p className="db-muted-hint">
          {picking
            ? `Click a card in the browse view to set ${picking === 'out' ? 'Out' : 'In'}.`
            : 'Use Change, then click a card in the main or aside browse.'}
        </p>
        <label>
          Place In card in category
          <select
            className="db-select"
            value={draft.inTargetCategory || ''}
            onChange={(e) => onDraftChange({ inTargetCategory: e.target.value || null })}
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
          <input
            className="db-input"
            value={draft.notes}
            onChange={(e) => onDraftChange({ notes: e.target.value })}
          />
        </label>
        <div className="db-modal-actions">
          <button type="button" className="db-btn db-btn-danger" onClick={onRemove}>
            Remove
          </button>
          <button type="button" className="db-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="db-btn is-active" onClick={onSave}>
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
  draft,
  picking,
  onStartEdit,
  onDraftChange,
  onSetPicking,
  onCancelEdit,
  onSaveEdit,
  onRemoveEdit,
}: {
  deck: DeckDocument;
  onChange: (next: DeckDocument) => void;
  draft: SwapEditDraft | null;
  picking: SwapPickSlot | null;
  onStartEdit: (entry: FormalSwapEntry) => void;
  onDraftChange: (patch: Partial<SwapEditDraft>) => void;
  onSetPicking: (slot: SwapPickSlot | null) => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onRemoveEdit: () => void;
}) {
  const entries = [...deck.formalSwapEntries].sort((a, b) => a.sortIndex - b.sortIndex);
  const incomplete = incompleteEntryCount(entries);
  const byId = new Map(deck.cards.map((c) => [c.instanceId, c]));

  function updateEntries(next: FormalSwapEntry[]) {
    onChange({
      ...deck,
      formalSwapEntries: next.map((e, i) => ({ ...e, sortIndex: i })),
      updatedAt: new Date().toISOString(),
    });
  }

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
          const isEditing = draft?.entryId === entry.id;
          return (
            <li key={entry.id}>
              <button
                type="button"
                className={`db-swap-pair${incompleteEntry ? ' is-draft' : ''}${isEditing ? ' is-editing' : ''}`}
                onClick={() => onStartEdit(entry)}
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

      {draft ? (
        <SwapEditChrome
          deck={deck}
          draft={draft}
          picking={picking}
          onDraftChange={onDraftChange}
          onSetPicking={onSetPicking}
          onClose={onCancelEdit}
          onSave={onSaveEdit}
          onRemove={onRemoveEdit}
        />
      ) : null}
    </div>
  );
}
