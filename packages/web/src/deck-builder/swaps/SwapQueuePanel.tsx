import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import {
  cardDisplayName,
  incompleteEntryCount,
  SEEKING,
  resolveDeckCards,
  syncCardsWithFormalSwaps,
  type CardView,
  type DeckDocument,
  type FormalSwapEntry,
  type PrintingFields,
} from '@rayenz-hub/shared';
import { CARD_SIZE_SWAP_ASIDE_PX, useCardSize } from '../card-size';
import { ScryfallSearchModal } from '../scryfall/ScryfallSearchModal';
import {
  draftFromFormalEntry,
  SwapEditChrome,
  type SwapEditDraft,
} from './swap-edit-chrome';
import { SwapPairFaces } from './swap-pair-faces';

export type { SwapEditDraft };
export { SwapEditChrome, draftFromFormalEntry };
export { SwapPairFaces, SwapPairTile, MiniCard, SwapArrow } from './swap-pair-faces';

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

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function SwapPairButton({
  entry,
  outCard,
  inCard,
  incompleteEntry,
  isEditing,
  popoutWidthPx,
  onStartEdit,
}: {
  entry: FormalSwapEntry;
  outCard: CardView | null;
  inCard: CardView | null;
  incompleteEntry: boolean;
  isEditing: boolean;
  /** Live picker size for hover popout only; preview stays Small via panel CSS. */
  popoutWidthPx: number;
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
    const popW = popoutWidthPx * 2 + 48;
    const popH = popoutWidthPx * 1.4 + (entry.inTargetCategory ? 40 : 24);
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
  }, [hover, popoutWidthPx, entry.inTargetCategory]);

  const popoutStyle = {
    ['--db-card-w']: `${popoutWidthPx}px`,
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

function SeekingSection({
  deck,
  onAdd,
  onRemove,
}: {
  deck: DeckDocument;
  onAdd: (printing: PrintingFields, meta?: { proxy: boolean }) => void;
  onRemove: (entryId: string) => void;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const entries = [...(deck.lookingForEntries || [])].sort(
    (a, b) => a.sortIndex - b.sortIndex,
  );
  const cardsById = new Map(resolveDeckCards(deck).map((c) => [c.instanceId, c]));

  return (
    <div className="db-looking-for">
      <div className="db-swaps-header">
        <h3>Seeking</h3>
        <button
          type="button"
          className="db-btn"
          aria-label="Add to Seeking"
          onClick={() => setSearchOpen(true)}
        >
          Add
        </button>
      </div>
      <ul className="db-looking-for-list">
        {entries.map((entry) => {
          const card = cardsById.get(entry.instanceId) || null;
          const name = card ? cardDisplayName(card) : 'Unknown card';
          return (
            <li key={entry.id} className="db-looking-for-item">
              <span className="db-looking-for-name">{name}</span>
              <button
                type="button"
                className="db-btn db-btn-danger"
                aria-label={`Remove ${name} from Seeking`}
                onClick={() => onRemove(entry.id)}
              >
                Remove
              </button>
            </li>
          );
        })}
      </ul>
      {!entries.length ? <p className="db-empty">No Seeking cards yet.</p> : null}

      {searchOpen ? (
        <ScryfallSearchModal
          deck={deck}
          title="Add card to Seeking"
          confirmLabel="Add to Seeking"
          defaultCategory={SEEKING}
          onClose={() => setSearchOpen(false)}
          onAdd={(printing, _category, meta) => {
            onAdd(printing, meta);
            setSearchOpen(false);
          }}
        />
      ) : null}
    </div>
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
  onAddLookingFor,
  onRemoveLookingFor,
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
  onAddLookingFor: (printing: PrintingFields, meta?: { proxy: boolean }) => void;
  onRemoveLookingFor: (entryId: string) => void;
}) {
  const { widthPx: popoutWidthPx } = useCardSize();
  const entries = [...deck.formalSwapEntries].sort((a, b) => a.sortIndex - b.sortIndex);
  const incomplete = incompleteEntryCount(entries);
  const byId = new Map(resolveDeckCards(deck).map((c) => [c.instanceId, c]));

  function updateEntries(next: FormalSwapEntry[]) {
    onChange(syncCardsWithFormalSwaps(deck, next));
  }

  const panelStyle = {
    ['--db-card-w']: `${CARD_SIZE_SWAP_ASIDE_PX}px`,
    ['--db-swap-card-w']: `${CARD_SIZE_SWAP_ASIDE_PX}px`,
  } as CSSProperties;

  return (
    <div className="db-swaps" style={panelStyle}>
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
                popoutWidthPx={popoutWidthPx}
                onStartEdit={onStartEdit}
              />
            </li>
          );
        })}
      </ul>
      {!entries.length ? <p className="db-empty">No swap pairings yet.</p> : null}

      <SeekingSection deck={deck} onAdd={onAddLookingFor} onRemove={onRemoveLookingFor} />

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
