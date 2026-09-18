import { useEffect } from 'react';
import type { DeckOwnership, DeckVisibility } from '@rayenz-hub/shared';
import { useClampedFixedMenuPosition } from '../../ui/clampFixedMenuPosition';

export type DeckOwnershipMenuState = {
  x: number;
  y: number;
  deckId: string;
  current: DeckOwnership;
  visibility: DeckVisibility;
  isSample?: boolean;
};

/** Right-click menu to duplicate a deck and mark Owned/Theory and Public/Private. */
export function DeckOwnershipContextMenu({
  state,
  onClose,
  onDuplicate,
  duplicateDisabled,
  duplicateLabel = 'Duplicate',
  onSetOwnership,
  onSetVisibility,
}: {
  state: DeckOwnershipMenuState;
  onClose: () => void;
  onDuplicate?: (deckId: string) => void;
  duplicateDisabled?: boolean;
  duplicateLabel?: string;
  onSetOwnership?: (deckId: string, ownership: DeckOwnership) => void;
  onSetVisibility?: (deckId: string, visibility: DeckVisibility) => void;
}) {
  const nextOwnership: DeckOwnership = state.current === 'theory' ? 'owned' : 'theory';
  const ownershipLabel = nextOwnership === 'theory' ? 'Mark as Theory' : 'Mark as Owned';
  const nextVisibility: DeckVisibility = state.visibility === 'private' ? 'public' : 'private';
  const visibilityLabel = nextVisibility === 'private' ? 'Mark as Private' : 'Mark as Public';
  const showMeta = !state.isSample;
  const { ref: rootRef, style } = useClampedFixedMenuPosition(state.x, state.y, [
    Boolean(onDuplicate),
    showMeta && Boolean(onSetOwnership),
    showMeta && Boolean(onSetVisibility),
  ]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (rootRef.current?.contains(e.target as Node)) return;
      onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose, rootRef]);

  return (
    <div
      ref={rootRef}
      className="db-context-menu db-deck-ownership-menu"
      style={style}
      role="menu"
      onContextMenu={(e) => e.preventDefault()}
    >
      {onDuplicate ? (
        <button
          type="button"
          role="menuitem"
          className="db-context-menu-item"
          disabled={duplicateDisabled}
          onClick={() => {
            if (duplicateDisabled) return;
            onDuplicate(state.deckId);
            onClose();
          }}
        >
          {duplicateLabel}
        </button>
      ) : null}
      {showMeta && onSetOwnership ? (
        <button
          type="button"
          role="menuitem"
          className="db-context-menu-item"
          onClick={() => {
            onSetOwnership(state.deckId, nextOwnership);
            onClose();
          }}
        >
          {ownershipLabel}
        </button>
      ) : null}
      {showMeta && onSetVisibility ? (
        <button
          type="button"
          role="menuitem"
          className="db-context-menu-item"
          onClick={() => {
            onSetVisibility(state.deckId, nextVisibility);
            onClose();
          }}
        >
          {visibilityLabel}
        </button>
      ) : null}
    </div>
  );
}
