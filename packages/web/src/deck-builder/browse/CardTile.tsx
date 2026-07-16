import { cardImageUrl, type CardInstance } from '@rayenz-hub/shared';

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
      {src ? (
        <img src={src} alt={card.name} loading="lazy" className="db-card-img" />
      ) : (
        <span className="db-card-fallback">{card.name}</span>
      )}
      {foil ? (
        <span className="db-card-badges db-card-badges-foil">
          <span className="db-badge db-badge-foil">Foil</span>
        </span>
      ) : null}
      {qty > 1 ? (
        <span className="db-card-badges db-card-badges-qty">
          <span className="db-badge db-badge-qty">×{qty}</span>
        </span>
      ) : null}
    </button>
  );
}

export { DRAG_MIME };
