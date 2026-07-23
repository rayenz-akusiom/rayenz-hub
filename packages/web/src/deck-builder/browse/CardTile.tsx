import {
  cardDisplayName,
  cardHasBackFace,
  cardImageUrl,
  type CardView,
  type CategoryMembership,
} from '@rayenz-hub/shared';
import type { DragEvent, KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent } from 'react';
import { CardFace } from './CardFace';

const DRAG_MIME = 'application/x-deck-builder-instance';
const DRAG_MIME_MULTI = 'application/x-deck-builder-instances';

export type SelectCardHandler = (card: CardView, e?: ReactMouseEvent | ReactKeyboardEvent) => void;

/** Instance ids encoded on an HTML5 drag (multi MIME preferred). */
export function readDragInstanceIds(dt: DataTransfer): string[] {
  const multi = dt.getData(DRAG_MIME_MULTI);
  if (multi) {
    try {
      const parsed: unknown = JSON.parse(multi);
      if (
        Array.isArray(parsed) &&
        parsed.length > 0 &&
        parsed.every((id) => typeof id === 'string' && id)
      ) {
        return parsed as string[];
      }
    } catch {
      /* fall through to single-id MIME */
    }
  }
  const id = dt.getData(DRAG_MIME) || dt.getData('text/plain');
  return id ? [id] : [];
}

export function isDeckBuilderDragTypes(types: Iterable<string> | null | undefined): boolean {
  if (!types) return false;
  const list = Array.from(types);
  return (
    list.includes(DRAG_MIME) ||
    list.includes(DRAG_MIME_MULTI) ||
    list.includes('text/plain')
  );
}

function dragInstanceIdsFor(
  instanceId: string,
  selectedIds?: ReadonlySet<string> | null,
): string[] {
  if (selectedIds?.has(instanceId) && selectedIds.size > 1) {
    return [instanceId, ...[...selectedIds].filter((id) => id !== instanceId)];
  }
  return [instanceId];
}

export function CardTile({
  card,
  onSelect,
  selected,
  selectedIds,
  draggable = false,
  actionLabel,
  onContextMenu,
  membership = 'primary',
  swapInGhost = false,
}: {
  card: CardView;
  onSelect?: SelectCardHandler;
  selected?: boolean;
  /** When set, dragging a selected card carries the full multi-selection. */
  selectedIds?: ReadonlySet<string> | null;
  draggable?: boolean;
  /** Accessible name when the tile is an action (e.g. swap Change). */
  actionLabel?: string;
  onContextMenu?: (card: CardView, e: ReactMouseEvent) => void;
  membership?: CategoryMembership;
  /** Formal swap In — temporary ghost styling in main browse. */
  swapInGhost?: boolean;
}) {
  const src = cardImageUrl(card);
  const doubleFaced = cardHasBackFace(card.layout);
  const backSrc = doubleFaced ? cardImageUrl(card, 'back') : null;
  const qty = Number(card.quantity) || 1;
  const foil = Boolean(card.foil);
  const proxy = Boolean(card.proxy);
  const displayName = cardDisplayName(card);
  const secondary = membership === 'secondary';

  function onDragStart(e: DragEvent<HTMLDivElement>) {
    if (!draggable) return;
    const ids = dragInstanceIdsFor(card.instanceId, selectedIds);
    e.dataTransfer.setData(DRAG_MIME, card.instanceId);
    e.dataTransfer.setData('text/plain', card.instanceId);
    if (ids.length > 1) {
      e.dataTransfer.setData(DRAG_MIME_MULTI, JSON.stringify(ids));
    }
    e.dataTransfer.effectAllowed = 'move';
    e.currentTarget.classList.add('is-drag-source');
  }

  function onDragEnd(e: DragEvent<HTMLDivElement>) {
    e.currentTarget.classList.remove('is-drag-source');
  }

  return (
    <div
      role="button"
      tabIndex={0}
      className={`db-card-tile${selected ? ' is-selected' : ''}${foil ? ' is-foil' : ''}${proxy ? ' is-proxy' : ''}${qty > 1 ? ' has-qty' : ''}${secondary ? ' is-secondary-cat' : ''}${swapInGhost ? ' is-swap-in-ghost' : ''}`}
      onClick={(e) => onSelect?.(card, e)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect?.(card, e);
        }
      }}
      onContextMenu={(e) => {
        if (!onContextMenu) return;
        e.preventDefault();
        onContextMenu(card, e);
      }}
      title={swapInGhost ? `${displayName} (swap in)` : displayName}
      aria-label={actionLabel || (swapInGhost ? `${displayName}, swap in` : displayName)}
      aria-pressed={selected}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <CardFace
        src={src}
        backSrc={backSrc}
        name={displayName}
        foil={foil}
        proxy={proxy}
        quantity={qty}
        faceKey={card.instanceId}
        doubleFaced={doubleFaced}
      />
    </div>
  );
}

export { DRAG_MIME, DRAG_MIME_MULTI };
