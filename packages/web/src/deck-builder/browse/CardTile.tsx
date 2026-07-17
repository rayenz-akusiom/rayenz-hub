import {
  cardDisplayName,
  cardHasBackFace,
  cardImageUrl,
  type CardView,
} from '@rayenz-hub/shared';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { CardFace } from './CardFace';

const DRAG_MIME = 'application/x-deck-builder-instance';

export function CardTile({
  card,
  onSelect,
  selected,
  draggable = false,
  actionLabel,
  onContextMenu,
}: {
  card: CardView;
  onSelect?: (card: CardView) => void;
  selected?: boolean;
  draggable?: boolean;
  /** Accessible name when the tile is an action (e.g. swap Change). */
  actionLabel?: string;
  onContextMenu?: (card: CardView, e: ReactMouseEvent) => void;
}) {
  const src = cardImageUrl(card);
  const doubleFaced = cardHasBackFace(card.layout);
  const backSrc = doubleFaced ? cardImageUrl(card, 'back') : null;
  const qty = Number(card.quantity) || 1;
  const foil = Boolean(card.foil);
  const proxy = Boolean(card.proxy);
  const displayName = cardDisplayName(card);

  return (
    <div
      role="button"
      tabIndex={0}
      className={`db-card-tile${selected ? ' is-selected' : ''}${foil ? ' is-foil' : ''}${proxy ? ' is-proxy' : ''}${qty > 1 ? ' has-qty' : ''}`}
      onClick={() => onSelect?.(card)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect?.(card);
        }
      }}
      onContextMenu={(e) => {
        if (!onContextMenu) return;
        e.preventDefault();
        onContextMenu(card, e);
      }}
      title={displayName}
      aria-label={actionLabel || displayName}
      draggable={draggable}
      onDragStart={(e) => {
        if (!draggable) return;
        e.dataTransfer.setData(DRAG_MIME, card.instanceId);
        e.dataTransfer.setData('text/plain', card.instanceId);
        e.dataTransfer.effectAllowed = 'move';
      }}
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

export { DRAG_MIME };
