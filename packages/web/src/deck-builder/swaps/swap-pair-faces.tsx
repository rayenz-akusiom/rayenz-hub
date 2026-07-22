import {
  cardDisplayName,
  cardHasBackFace,
  cardImageUrl,
  type CardView,
} from '@rayenz-hub/shared';
import { CardFace } from '../browse/CardFace';

function blockDrag(e: React.DragEvent) {
  e.preventDefault();
  e.stopPropagation();
}

export function SwapArrow({ className }: { className?: string }) {
  return (
    <span className={`db-swap-arrow${className ? ` ${className}` : ''}`} aria-hidden="true">
      <svg viewBox="0 0 24 24" width="1em" height="1em" focusable="false">
        <path
          fill="currentColor"
          d="M4 11h12.17l-3.58-3.59L14 6l6 6-6 6-1.41-1.41L16.17 13H4v-2z"
        />
      </svg>
    </span>
  );
}

export function MiniCard({ card }: { card: CardView | null }) {
  if (!card) {
    return (
      <div className="db-swap-mini is-empty">
        <span className="db-swap-mini-fallback">—</span>
      </div>
    );
  }
  const src = cardImageUrl(card);
  const doubleFaced = cardHasBackFace(card.layout);
  const backSrc = doubleFaced ? cardImageUrl(card, 'back') : null;
  const qty = Number(card.quantity) || 1;
  const foil = Boolean(card.foil);
  const proxy = Boolean(card.proxy);
  return (
    <div
      className={`db-swap-mini${foil ? ' is-foil' : ''}${proxy ? ' is-proxy' : ''}${qty > 1 ? ' has-qty' : ''}`}
      onDragStart={blockDrag}
    >
      <CardFace
        src={src}
        backSrc={backSrc}
        name={cardDisplayName(card)}
        foil={foil}
        proxy={proxy}
        quantity={qty}
        faceKey={card.instanceId}
        doubleFaced={doubleFaced}
      />
    </div>
  );
}

export function SwapPairFaces({
  outCard,
  inCard,
  variant,
}: {
  outCard: CardView | null;
  inCard: CardView | null;
  variant: 'preview' | 'popout';
}) {
  return (
    <div className={`db-swap-pair-stack${variant === 'popout' ? ' is-full' : ' is-preview'}`}>
      <div className="db-swap-pair-out">
        <MiniCard card={outCard} />
      </div>
      <SwapArrow className="db-swap-pair-arrow" />
      <div className="db-swap-pair-in">
        <MiniCard card={inCard} />
      </div>
    </div>
  );
}

/** Grid tile for Swap Queue: Out→In faces with optional deck label. */
export function SwapPairTile({
  outCard,
  inCard,
  incomplete,
  deckLabel,
  inTargetCategory,
  onClick,
  title = 'Click to edit swap',
}: {
  outCard: CardView | null;
  inCard: CardView | null;
  incomplete?: boolean;
  deckLabel?: string;
  inTargetCategory?: string | null;
  onClick?: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      className={`db-swap-pair${incomplete ? ' is-draft' : ''}`}
      onClick={onClick}
      onDragStart={blockDrag}
      title={title}
    >
      {deckLabel ? <span className="sq-tile-deck db-swap-deck-label">{deckLabel}</span> : null}
      <SwapPairFaces outCard={outCard} inCard={inCard} variant="preview" />
      {inTargetCategory ? <span className="db-swap-target">→ {inTargetCategory}</span> : null}
    </button>
  );
}
