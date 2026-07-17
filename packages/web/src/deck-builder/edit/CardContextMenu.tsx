import { useEffect, useRef } from 'react';
import { FoilIcon } from '../../cards/FoilIcon';

export type CardContextMenuState = {
  x: number;
  y: number;
  instanceId: string;
};

export function CardContextMenu({
  state,
  isCover,
  foil,
  foilEnabled,
  onClose,
  onToggleFoil,
  onSetCover,
  onClearCover,
  onMove,
  onChangePrinting,
  onRemove,
}: {
  state: CardContextMenuState;
  isCover: boolean;
  foil: boolean;
  foilEnabled: boolean;
  onClose: () => void;
  onToggleFoil: () => void;
  onSetCover: () => void;
  onClearCover: () => void;
  onMove: () => void;
  onChangePrinting: () => void;
  onRemove: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);

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

  // Keep menu on-screen roughly.
  const style = {
    left: Math.min(state.x, typeof window !== 'undefined' ? window.innerWidth - 200 : state.x),
    top: Math.min(state.y, typeof window !== 'undefined' ? window.innerHeight - 220 : state.y),
  };

  return (
    <div
      ref={rootRef}
      className="db-card-context-menu"
      role="menu"
      style={style}
      onContextMenu={(e) => e.preventDefault()}
    >
      <button
        type="button"
        role="menuitem"
        className="db-card-context-item"
        disabled={!foilEnabled && !foil}
        onClick={() => {
          onToggleFoil();
          onClose();
        }}
      >
        <span className={`db-card-context-foil${foil ? ' is-foil' : ''}`}>
          <FoilIcon filled={foil} />
        </span>
        {foil ? 'Unmark foil' : 'Mark as foil'}
      </button>
      {isCover ? (
        <button
          type="button"
          role="menuitem"
          className="db-card-context-item"
          onClick={() => {
            onClearCover();
            onClose();
          }}
        >
          Clear cover
        </button>
      ) : (
        <button
          type="button"
          role="menuitem"
          className="db-card-context-item"
          onClick={() => {
            onSetCover();
            onClose();
          }}
        >
          Set as cover
        </button>
      )}
      <button
        type="button"
        role="menuitem"
        className="db-card-context-item"
        onClick={() => {
          onMove();
          onClose();
        }}
      >
        Move…
      </button>
      <button
        type="button"
        role="menuitem"
        className="db-card-context-item"
        onClick={() => {
          onChangePrinting();
          onClose();
        }}
      >
        Change printing…
      </button>
      <button
        type="button"
        role="menuitem"
        className="db-card-context-item is-danger"
        onClick={() => {
          onRemove();
          onClose();
        }}
      >
        Remove
      </button>
    </div>
  );
}
