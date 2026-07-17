import { useEffect, useRef, useState } from 'react';
import { FoilIcon } from '../../cards/FoilIcon';
import { ProxyIcon } from '../../cards/ProxyIcon';

export type CardContextMenuState = {
  x: number;
  y: number;
  instanceId: string;
};

export function CardContextMenu({
  state,
  selectionCount = 1,
  isCover,
  foil,
  foilEnabled,
  proxy,
  secondaryCategories = [],
  categoryOptions = [],
  onClose,
  onToggleFoil,
  onToggleProxy,
  onSetCover,
  onClearCover,
  onMove,
  onMoveToDefault,
  onChangePrinting,
  onRemove,
  onRemoveSecondary,
  onAddSecondary,
}: {
  state: CardContextMenuState;
  /** Number of cards in the active selection (menu targets all when > 1). */
  selectionCount?: number;
  isCover: boolean;
  foil: boolean;
  foilEnabled: boolean;
  proxy: boolean;
  secondaryCategories?: string[];
  /** Categories available to add as secondary (excludes current memberships). */
  categoryOptions?: string[];
  onClose: () => void;
  onToggleFoil: () => void;
  onToggleProxy: () => void;
  onSetCover: () => void;
  onClearCover: () => void;
  onMove: () => void;
  onMoveToDefault?: () => void;
  onChangePrinting: () => void;
  onRemove: () => void;
  onRemoveSecondary?: (category: string) => void;
  onAddSecondary?: (category: string) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [addingSecondary, setAddingSecondary] = useState(false);
  const [creatingNew, setCreatingNew] = useState(false);
  const [newCategory, setNewCategory] = useState('');
  const multi = selectionCount > 1;

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
    left: Math.min(state.x, typeof window !== 'undefined' ? window.innerWidth - 220 : state.x),
    top: Math.min(state.y, typeof window !== 'undefined' ? window.innerHeight - 320 : state.y),
  };

  function commitAddSecondary(name: string) {
    const trimmed = name.trim();
    if (!trimmed || !onAddSecondary) return;
    onAddSecondary(trimmed);
    onClose();
  }

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
        {foil
          ? multi
            ? `Unmark foil (${selectionCount})`
            : 'Unmark foil'
          : multi
            ? `Mark as foil (${selectionCount})`
            : 'Mark as foil'}
      </button>
      <button
        type="button"
        role="menuitem"
        className="db-card-context-item"
        onClick={() => {
          onToggleProxy();
          onClose();
        }}
      >
        <span className={`db-card-context-proxy${proxy ? ' is-proxy' : ''}`}>
          <ProxyIcon filled={proxy} />
        </span>
        {proxy
          ? multi
            ? `Unmark proxy (${selectionCount})`
            : 'Unmark proxy'
          : multi
            ? `Mark as proxy (${selectionCount})`
            : 'Mark as proxy'}
      </button>
      {!multi ? (
        isCover ? (
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
        )
      ) : null}
      <button
        type="button"
        role="menuitem"
        className="db-card-context-item"
        onClick={() => {
          onMove();
          onClose();
        }}
      >
        {multi ? `Move ${selectionCount}…` : 'Move…'}
      </button>
      {onMoveToDefault ? (
        <button
          type="button"
          role="menuitem"
          className="db-card-context-item"
          onClick={() => {
            onMoveToDefault();
            onClose();
          }}
        >
          {multi ? `Move ${selectionCount} to default` : 'Move to default'}
        </button>
      ) : null}
      {!multi
        ? secondaryCategories.map((cat) => (
            <button
              key={cat}
              type="button"
              role="menuitem"
              className="db-card-context-item"
              onClick={() => {
                onRemoveSecondary?.(cat);
                onClose();
              }}
            >
              Remove from {cat}
            </button>
          ))
        : null}
      {!multi && onAddSecondary ? (
        addingSecondary ? (
          <div className="db-card-context-add-secondary" role="none">
            {creatingNew ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  commitAddSecondary(newCategory);
                }}
              >
                <input
                  className="db-input"
                  placeholder="New category"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  autoFocus
                />
              </form>
            ) : (
              <select
                className="db-select"
                value=""
                aria-label="Add secondary category"
                onChange={(e) => {
                  if (e.target.value === '__new__') {
                    setCreatingNew(true);
                    return;
                  }
                  if (e.target.value) commitAddSecondary(e.target.value);
                }}
              >
                <option value="">Choose…</option>
                {categoryOptions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
                <option value="__new__">New category…</option>
              </select>
            )}
          </div>
        ) : (
          <button
            type="button"
            role="menuitem"
            className="db-card-context-item"
            onClick={() => setAddingSecondary(true)}
          >
            Add secondary category…
          </button>
        )
      ) : null}
      {!multi ? (
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
      ) : null}
      <button
        type="button"
        role="menuitem"
        className="db-card-context-item is-danger"
        onClick={() => {
          onRemove();
          onClose();
        }}
      >
        {multi ? `Remove ${selectionCount}` : 'Remove'}
      </button>
    </div>
  );
}
