import { useEffect, useRef } from 'react';
import type { DeckOwnership } from '@rayenz-hub/shared';

export type DeckOwnershipMenuState = {
  x: number;
  y: number;
  deckId: string;
  current: DeckOwnership;
};

/** Right-click menu to mark a deck Owned or Theory (no toggles). */
export function DeckOwnershipContextMenu({
  state,
  onClose,
  onSetOwnership,
}: {
  state: DeckOwnershipMenuState;
  onClose: () => void;
  onSetOwnership: (deckId: string, ownership: DeckOwnership) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const next: DeckOwnership = state.current === 'theory' ? 'owned' : 'theory';
  const label = next === 'theory' ? 'Mark as Theory' : 'Mark as Owned';

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
    top: Math.min(state.y, typeof window !== 'undefined' ? window.innerHeight - 80 : state.y),
  };

  return (
    <div
      ref={rootRef}
      className="db-context-menu db-deck-ownership-menu"
      style={style}
      role="menu"
      onContextMenu={(e) => e.preventDefault()}
    >
      <button
        type="button"
        role="menuitem"
        className="db-context-menu-item"
        onClick={() => {
          onSetOwnership(state.deckId, next);
          onClose();
        }}
      >
        {label}
      </button>
    </div>
  );
}
