import { useState, type DragEvent } from 'react';
import {
  isDeckBuilderDragTypes,
  readDragInstanceIds,
} from './CardTile';
import { useDeckBuilderDragging } from './useDeckBuilderDragging';

export function AddCardFab({
  onAddClick,
  onDropDefault,
  onDropNewCategory,
}: {
  onAddClick: () => void;
  onDropDefault: (instanceIds: string[]) => void;
  onDropNewCategory: (instanceIds: string[]) => void;
}) {
  const dragging = useDeckBuilderDragging();
  const [overZone, setOverZone] = useState<'default' | 'new' | null>(null);

  if (!dragging) {
    return (
      <button
        type="button"
        className="db-add-fab"
        aria-label="Add card"
        title="Add card"
        onClick={onAddClick}
      >
        <span className="db-add-fab-plus" aria-hidden="true">
          +
        </span>
      </button>
    );
  }

  function allowDrop(e: DragEvent) {
    if (!isDeckBuilderDragTypes(e.dataTransfer.types)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }

  function handleDrop(
    e: DragEvent,
    zone: 'default' | 'new',
  ) {
    e.preventDefault();
    setOverZone(null);
    const ids = readDragInstanceIds(e.dataTransfer);
    if (!ids.length) return;
    if (zone === 'default') onDropDefault(ids);
    else onDropNewCategory(ids);
  }

  return (
    <div
      className="db-add-fab db-add-fab-drop"
      role="group"
      aria-label="Move cards to category"
    >
      <div
        className={`db-add-fab-zone${overZone === 'default' ? ' is-drop-target' : ''}`}
        aria-label="Default category"
        onDragOver={(e) => {
          allowDrop(e);
          setOverZone('default');
        }}
        onDragLeave={() => setOverZone((z) => (z === 'default' ? null : z))}
        onDrop={(e) => handleDrop(e, 'default')}
      >
        Default
      </div>
      <div
        className={`db-add-fab-zone${overZone === 'new' ? ' is-drop-target' : ''}`}
        aria-label="New category"
        onDragOver={(e) => {
          allowDrop(e);
          setOverZone('new');
        }}
        onDragLeave={() => setOverZone((z) => (z === 'new' ? null : z))}
        onDrop={(e) => handleDrop(e, 'new')}
      >
        New Category
      </div>
    </div>
  );
}
