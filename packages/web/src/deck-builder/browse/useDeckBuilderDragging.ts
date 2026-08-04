import { useEffect, useState } from 'react';
import { isDeckBuilderDragTypes } from './CardTile';

/** True while a deck-builder card drag is in progress. */
export function useDeckBuilderDragging(): boolean {
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    function onDragStart(e: DragEvent) {
      if (isDeckBuilderDragTypes(e.dataTransfer?.types)) setDragging(true);
    }
    function onDragEnd() {
      setDragging(false);
    }

    document.addEventListener('dragstart', onDragStart);
    document.addEventListener('dragend', onDragEnd);
    document.addEventListener('drop', onDragEnd);
    return () => {
      document.removeEventListener('dragstart', onDragStart);
      document.removeEventListener('dragend', onDragEnd);
      document.removeEventListener('drop', onDragEnd);
    };
  }, []);

  return dragging;
}
