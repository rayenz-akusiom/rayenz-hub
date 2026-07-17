import { cardHasBackFace, cardImageUrl, type CardView } from '@rayenz-hub/shared';
import { CardFace } from './CardFace';

const DRAG_MIME = 'application/x-deck-builder-instance';

export function CardTile({
  card,
  onSelect,
  selected,
  draggable = false,
  actionLabel,
}: {
  card: CardView;
  onSelect?: (card: CardView) => void;
  selected?: boolean;
  draggable?: boolean;
  /** Accessible name when the tile is an action (e.g. swap Change). */
  actionLabel?: string;
}) {
  const src = cardImageUrl(card);
  const doubleFaced = cardHasBackFace(card.layout);
  const backSrc = doubleFaced ? cardImageUrl(card, 'back') : null;
  const qty = Number(card.quantity) || 1;
  const foil = Boolean(card.foil);

  return (
    <button
      type="button"
      className={`db-card-tile${selected ? ' is-selected' : ''}${foil ? ' is-foil' : ''}${qty > 1 ? ' has-qty' : ''}`}
      onClick={() => onSelect?.(card)}
      title={card.name}
      aria-label={actionLabel || undefined}
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
        name={card.name}
        foil={foil}
        quantity={qty}
        faceKey={card.instanceId}
        doubleFaced={doubleFaced}
      />
    </button>
  );
}

export { DRAG_MIME };
