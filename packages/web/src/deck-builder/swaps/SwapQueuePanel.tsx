import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import {
  categoryIncluded,
  cardDisplayName,
  defaultAddCategory,
  incompleteEntryCount,
  isSwapQueueCategory,
  resolveDeckCards,
  type CardView,
  type DeckDocument,
  type FormalSwapEntry,
  type PrintingFields,
} from '@rayenz-hub/shared';
import { cardHasBackFace, cardImageUrl } from '@rayenz-hub/shared';
import { CardTile } from '../browse/CardTile';
import { CardFace } from '../browse/CardFace';
import { useCardSize } from '../card-size';
import { ScryfallSearchModal } from '../scryfall/ScryfallSearchModal';
import { openOutCardPicker } from './swap-pickers';

export type SwapEditDraft = {
  entryId: string;
  inInstanceId: string | null;
  outInstanceId: string | null;
  inTargetCategory: string | null;
  notes: string;
};

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

function SwapArrow({ className }: { className?: string }) {
  return (
    <span className={`db-swap-arrow${className ? ` ${className}` : ''}`} aria-hidden="true">
      <svg viewBox="0 0 24 24" width="1em" height="1em" focusable="false">
        <path
          fill="currentColor"
          d="M4 11h12.17l-3.58-3.59L14 6l6 6-6 6-1.41-1.41L16.17 13H4v-2z"
        />
      </svg>
    </span>
  );
}

function MiniCard({ card }: { card: CardView | null }) {
  if (!card) {
    return (
      <div className="db-swap-mini is-empty">
        <span className="db-swap-mini-fallback">—</span>
      </div>
    );
  }
  const src = cardImageUrl(card);
  const doubleFaced = cardHasBackFace(card.layout);
  const backSrc = doubleFaced ? cardImageUrl(card, 'back') : null;
  const qty = Number(card.quantity) || 1;
  const foil = Boolean(card.foil);
  const proxy = Boolean(card.proxy);
  return (
    <div
      className={`db-swap-mini${foil ? ' is-foil' : ''}${proxy ? ' is-proxy' : ''}${qty > 1 ? ' has-qty' : ''}`}
      onDragStart={blockDrag}
    >
      <CardFace
        src={src}
        backSrc={backSrc}
        name={cardDisplayName(card)}
        foil={foil}
        proxy={proxy}
        quantity={qty}
        faceKey={card.instanceId}
        doubleFaced={doubleFaced}
      />
    </div>
  );
}

function SwapPairFaces({
  outCard,
  inCard,
  variant,
}: {
  outCard: CardView | null;
  inCard: CardView | null;
  variant: 'preview' | 'popout';
}) {
  return (
    <div
      className={`db-swap-pair-stack${variant === 'popout' ? ' is-full' : ' is-preview'}`}
    >
      <div className="db-swap-pair-out">
        <MiniCard card={outCard} />
      </div>
      <SwapArrow className="db-swap-pair-arrow" />
      <div className="db-swap-pair-in">
        <MiniCard card={inCard} />
      </div>
    </div>
  );
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function SwapPairButton({
  entry,
  outCard,
  inCard,
  incompleteEntry,
  isEditing,
  cardWidthPx,
  onStartEdit,
}: {
  entry: FormalSwapEntry;
  outCard: CardView | null;
  inCard: CardView | null;
  incompleteEntry: boolean;
  isEditing: boolean;
  cardWidthPx: number;
  onStartEdit: (entry: FormalSwapEntry) => void;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [hover, setHover] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!hover || !triggerRef.current) {
      setPos(null);
      return;
    }
    const rect = triggerRef.current.getBoundingClientRect();
    const gap = 10;
    const edge = 8;
    const popW = cardWidthPx * 2 + 48;
    const popH = cardWidthPx * 1.4 + (entry.inTargetCategory ? 40 : 24);
    // Prefer left of the pair; fall back to right, then clamp.
    let left = rect.left - popW - gap;
    if (left < edge) {
      left = rect.right + gap;
    }
    left = clamp(left, edge, window.innerWidth - popW - edge);
    const top = clamp(
      rect.top + rect.height / 2 - popH / 2,
      edge,
      window.innerHeight - popH - edge,
    );
    setPos({ top, left });
  }, [hover, cardWidthPx, entry.inTargetCategory]);

  const popoutStyle = {
    ['--db-card-w']: `${cardWidthPx}px`,
    top: pos?.top ?? 0,
    left: pos?.left ?? 0,
  } as CSSProperties;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`db-swap-pair${incompleteEntry ? ' is-draft' : ''}${isEditing ? ' is-editing' : ''}`}
        onClick={() => onStartEdit(entry)}
        onDragStart={blockDrag}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onFocus={() => setHover(true)}
        onBlur={() => setHover(false)}
        title="Click to edit swap"
      >
        <SwapPairFaces outCard={outCard} inCard={inCard} variant="preview" />
        {entry.inTargetCategory ? (
          <span className="db-swap-target">→ {entry.inTargetCategory}</span>
        ) : null}
      </button>
      {hover && pos
        ? createPortal(
            <div
              className="db-swap-pair-popout"
              style={popoutStyle}
              role="presentation"
              aria-hidden="true"
            >
              <SwapPairFaces outCard={outCard} inCard={inCard} variant="popout" />
              {entry.inTargetCategory ? (
                <span className="db-swap-target">→ {entry.inTargetCategory}</span>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function SwapEditSlot({
  card,
  role,
  onChange,
}: {
  card: CardView | null;
  role: 'out' | 'in';
  onChange: () => void;
}) {
  const roleLabel = role === 'out' ? 'Out' : 'In';
  return (
    <div className="db-swap-edit-slot">
      {card ? (
        <CardTile
          card={card}
          selected={false}
          onSelect={() => onChange()}
          actionLabel={`Change ${roleLabel}`}
        />
      ) : (
        <button
          type="button"
          className="db-swap-edit-empty"
          aria-label={`Choose ${roleLabel}`}
          onClick={onChange}
        >
          Choose
        </button>
      )}
    </div>
  );
}

function useModalScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const main = document.querySelector('.hub-main') as HTMLElement | null;
    const prevMain = main?.style.overflow ?? '';
    const prevBody = document.body.style.overflow;
    if (main) main.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    return () => {
      if (main) main.style.overflow = prevMain;
      document.body.style.overflow = prevBody;
    };
  }, [active]);
}

function SwapEditChrome({
  deck,
  draft,
  onDraftChange,
  onConfirmIn,
  onClose,
  onSave,
  onRemove,
}: {
  deck: DeckDocument;
  draft: SwapEditDraft;
  onDraftChange: (patch: Partial<SwapEditDraft>) => void;
  onConfirmIn: (printing: PrintingFields, category: string, meta?: { proxy: boolean }) => void;
  onClose: () => void;
  onSave: () => void;
  onRemove: () => void;
}) {
  const [phase, setPhase] = useState<'edit' | 'in-search'>('edit');
  useModalScrollLock(true);

  const byId = new Map(resolveDeckCards(deck).map((c) => [c.instanceId, c]));
  const inCard = draft.inInstanceId ? byId.get(draft.inInstanceId) || null : null;
  const outCard = draft.outInstanceId ? byId.get(draft.outInstanceId) || null : null;

  const targetOptions = (deck.categories || [])
    .filter((c) => categoryIncluded(deck.categories, c.name) && !isSwapQueueCategory(c.name))
    .map((c) => c.name)
    .sort((a, b) => a.localeCompare(b));

  const swapInDefaultCategory = draft.inTargetCategory || defaultAddCategory(deck);

  function pickOut() {
    openOutCardPicker(deck, draft.outInstanceId, (instanceId) => {
      onDraftChange({ outInstanceId: instanceId });
    });
  }

  const dialogLabel = phase === 'in-search' ? 'Choose In card from Scryfall' : 'Edit swap';

  return createPortal(
    <div className="db-modal" role="dialog" aria-modal="true" aria-label={dialogLabel}>
      {phase === 'in-search' ? (
        <ScryfallSearchModal
          embedded
          deck={deck}
          title="Choose In card from Scryfall"
          confirmLabel="Use as In"
          printingTitle={(name) => `Printing — ${name}`}
          defaultCategory={swapInDefaultCategory}
          onClose={() => setPhase('edit')}
          onAdd={(printing, category, meta) => {
            onConfirmIn(printing, category, meta);
            setPhase('edit');
          }}
        />
      ) : (
        <div className="db-modal-card db-modal-wide db-swap-edit-chrome">
          <h3>Edit swap</h3>
          <div className="db-swap-edit-scroll">
            <div className="db-swap-edit-slots">
              <SwapEditSlot card={outCard} role="out" onChange={pickOut} />
              <SwapArrow />
              <SwapEditSlot card={inCard} role="in" onChange={() => setPhase('in-search')} />
            </div>
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
          </div>
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
      )}
    </div>,
    document.body,
  );
}

export function SwapQueuePanel({
  deck,
  onChange,
  draft,
  onStartEdit,
  onDraftChange,
  onConfirmIn,
  onCancelEdit,
  onSaveEdit,
  onRemoveEdit,
}: {
  deck: DeckDocument;
  onChange: (next: DeckDocument) => void;
  draft: SwapEditDraft | null;
  onStartEdit: (entry: FormalSwapEntry) => void;
  onDraftChange: (patch: Partial<SwapEditDraft>) => void;
  onConfirmIn: (printing: PrintingFields, category: string, meta?: { proxy: boolean }) => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onRemoveEdit: () => void;
}) {
  const { widthPx: cardWidthPx } = useCardSize();
  const entries = [...deck.formalSwapEntries].sort((a, b) => a.sortIndex - b.sortIndex);
  const incomplete = incompleteEntryCount(entries);
  const byId = new Map(resolveDeckCards(deck).map((c) => [c.instanceId, c]));

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
              <SwapPairButton
                entry={entry}
                outCard={outCard}
                inCard={inCard}
                incompleteEntry={incompleteEntry}
                isEditing={isEditing}
                cardWidthPx={cardWidthPx}
                onStartEdit={onStartEdit}
              />
            </li>
          );
        })}
      </ul>
      {!entries.length ? <p className="db-empty">No swap pairings yet.</p> : null}

      {draft ? (
        <SwapEditChrome
          deck={deck}
          draft={draft}
          onDraftChange={onDraftChange}
          onConfirmIn={onConfirmIn}
          onClose={onCancelEdit}
          onSave={onSaveEdit}
          onRemove={onRemoveEdit}
        />
      ) : null}
    </div>
  );
}
