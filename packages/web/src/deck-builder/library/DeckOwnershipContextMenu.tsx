import { useEffect, useRef } from 'react';
import type { DeckOwnership, DeckVisibility } from '@rayenz-hub/shared';

export type DeckOwnershipMenuState = {
  x: number;
  y: number;
  deckId: string;
  current: DeckOwnership;
  visibility: DeckVisibility;
};

/** Right-click menu to mark a deck Owned/Theory and Public/Private (no toggles). */
export function DeckOwnershipContextMenu({
  state,
  onClose,
  onSetOwnership,
  onSetVisibility,
}: {
  state: DeckOwnershipMenuState;
  onClose: () => void;
  onSetOwnership?: (deckId: string, ownership: DeckOwnership) => void;
  onSetVisibility?: (deckId: string, visibility: DeckVisibility) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const nextOwnership: DeckOwnership = state.current === 'theory' ? 'owned' : 'theory';
  const ownershipLabel = nextOwnership === 'theory' ? 'Mark as Theory' : 'Mark as Owned';
  const nextVisibility: DeckVisibility = state.visibility === 'private' ? 'public' : 'private';
  const visibilityLabel = nextVisibility === 'private' ? 'Mark as Private' : 'Mark as Public';

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
  }, [onClose]);

  const style = {
    left: Math.min(state.x, typeof window !== 'undefined' ? window.innerWidth - 200 : state.x),
    top: Math.min(state.y, typeof window !== 'undefined' ? window.innerHeight - 120 : state.y),
  };

  return (
    <div
      ref={rootRef}
      className="db-context-menu db-deck-ownership-menu"
      style={style}
      role="menu"
      onContextMenu={(e) => e.preventDefault()}
    >
      {onSetOwnership ? (
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
      {onSetVisibility ? (
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
