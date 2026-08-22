import { useState, type DragEvent } from 'react';
import {
  isDeckBuilderDragTypes,
  readDragInstanceIds,
} from './CardTile';
import { useDeckBuilderDragging } from './useDeckBuilderDragging';

type DropZone = 'default' | 'maybeboard' | 'new';

export function AddCardFab({
  onAddClick,
  onDropDefault,
  onDropMaybeboard,
  onDropNewCategory,
}: {
  onAddClick: () => void;
  onDropDefault: (instanceIds: string[]) => void;
  onDropMaybeboard: (instanceIds: string[]) => void;
  onDropNewCategory: (instanceIds: string[]) => void;
}) {
  const dragging = useDeckBuilderDragging();
  const [overZone, setOverZone] = useState<DropZone | null>(null);

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

  function handleDrop(e: DragEvent, zone: DropZone) {
    e.preventDefault();
    setOverZone(null);
    const ids = readDragInstanceIds(e.dataTransfer);
    if (!ids.length) return;
    if (zone === 'default') onDropDefault(ids);
    else if (zone === 'maybeboard') onDropMaybeboard(ids);
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
        className={`db-add-fab-zone${overZone === 'maybeboard' ? ' is-drop-target' : ''}`}
        aria-label="Maybeboard category"
        onDragOver={(e) => {
          allowDrop(e);
          setOverZone('maybeboard');
        }}
        onDragLeave={() => setOverZone((z) => (z === 'maybeboard' ? null : z))}
        onDrop={(e) => handleDrop(e, 'maybeboard')}
      >
        Maybeboard
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
