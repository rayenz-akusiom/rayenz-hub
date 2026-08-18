import { useEffect, useState, type RefObject } from 'react';
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

/**
 * True while a deck-builder card drag is over `leadersRef`.
 * Used to temporarily reveal the lieutenant drop target.
 */
export function useDeckBuilderHeaderDragHover(
  leadersRef: RefObject<HTMLElement | null>,
): boolean {
  const dragging = useDeckBuilderDragging();
  const [hover, setHover] = useState(false);

  useEffect(() => {
    if (!dragging) {
      setHover(false);
      return;
    }
    function onDragOver(e: DragEvent) {
      const root = leadersRef.current;
      const target = e.target;
      setHover(Boolean(root && target instanceof Node && root.contains(target)));
    }
    document.addEventListener('dragover', onDragOver);
    return () => document.removeEventListener('dragover', onDragOver);
  }, [dragging, leadersRef]);

  return dragging && hover;
}
