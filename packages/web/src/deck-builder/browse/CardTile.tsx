import { cardImageUrl, type CardInstance } from '@rayenz-hub/shared';
import { CardFace } from './CardFace';

const DRAG_MIME = 'application/x-deck-builder-instance';

export function CardTile({
  card,
  onSelect,
  selected,
  draggable = false,
}: {
  card: CardInstance;
  onSelect?: (card: CardInstance) => void;
  selected?: boolean;
  draggable?: boolean;
}) {
  const src = cardImageUrl(card);
  const qty = Number(card.quantity) || 1;
  const foil = Boolean(card.foil);

  return (
    <button
      type="button"
      className={`db-card-tile${selected ? ' is-selected' : ''}${foil ? ' is-foil' : ''}${qty > 1 ? ' has-qty' : ''}`}
      onClick={() => onSelect?.(card)}
      title={card.name}
      draggable={draggable}
      onDragStart={(e) => {
        if (!draggable) return;
        e.dataTransfer.setData(DRAG_MIME, card.instanceId);
        e.dataTransfer.setData('text/plain', card.instanceId);
        e.dataTransfer.effectAllowed = 'move';
      }}
    >
      <CardFace src={src} name={card.name} foil={foil} quantity={qty} />
    </button>
  );
}

export { DRAG_MIME };
