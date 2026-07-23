import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import {
  incompleteEntryCount,
  resolveDeckCards,
  syncCardsWithFormalSwaps,
  type CardView,
  type DeckDocument,
  type FormalSwapEntry,
  type PrintingFields,
} from '@rayenz-hub/shared';
import { CARD_SIZE_SWAP_ASIDE_PX, swapPairHoverPopoutWidthPx } from '../card-size';
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

const ASIDE_POPOUT_WIDTH_PX = swapPairHoverPopoutWidthPx(CARD_SIZE_SWAP_ASIDE_PX);

function SwapPairButton({
  entry,
  outCard,
  inCard,
  incompleteEntry,
  isEditing,
  onStartEdit,
}: {
  entry: FormalSwapEntry;
  outCard: CardView | null;
  inCard: CardView | null;
  incompleteEntry: boolean;
  isEditing: boolean;
  onStartEdit: (entry: FormalSwapEntry) => void;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [hover, setHover] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const popoutWidthPx = ASIDE_POPOUT_WIDTH_PX;

  useLayoutEffect(() => {
    if (!hover || popoutWidthPx == null || !triggerRef.current) {
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
    ['--db-card-w']: `${popoutWidthPx ?? 0}px`,
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
      {hover && popoutWidthPx != null && pos
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
