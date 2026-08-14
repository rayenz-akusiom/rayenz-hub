import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { cardDisplayName, type CardView } from '@rayenz-hub/shared';
import { swapPairHoverPopoutWidthPx } from '../deck-builder/card-size';
import { CardTile } from '../deck-builder/browse/CardTile';
import { FinalizeSwapConfirmDialog } from '../deck-builder/swaps/FinalizeSwapConfirm';
import { canShowHoverPopout } from '../deck-builder/swaps/swap-confirm';
import { SwapPairFaces } from '../deck-builder/swaps/swap-pair-faces';

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function blockDrag(e: React.DragEvent) {
  e.preventDefault();
  e.stopPropagation();
}

/** Reserved light bar: deck (truncates first) then target category. */
export function TileCategoryBar({
  deck,
  category,
}: {
  deck?: string | null;
  category?: string | null;
}) {
  const deckText = deck?.trim() || '';
  const categoryText = category?.trim() || '';
  if (!deckText && !categoryText) {
    return (
      <div className="sq-tile-cat-bar">
        <span className="sq-tile-cat-deck">{'\u00a0'}</span>
      </div>
    );
  }
  return (
    <div className="sq-tile-cat-bar">
      {deckText ? <span className="sq-tile-cat-deck">{deckText}</span> : null}
      {categoryText ? <span className="sq-tile-cat-target">{categoryText}</span> : null}
    </div>
  );
}

/** Single-face tile with category bar (Stacked / Grid / Seeking). */
export function SwapFaceTile({
  card,
  incomplete,
  deckLabel,
  categoryLabel,
  actionLabel,
  onClick,
  priceLabel,
  priceTitle,
}: {
  card: CardView | null;
  incomplete?: boolean;
  deckLabel?: string | null;
  categoryLabel?: string | null;
  actionLabel: string;
  onClick?: () => void;
  priceLabel?: string | null;
  priceTitle?: string | null;
}) {
  return (
    <div className={`sq-face-tile${incomplete ? ' is-draft' : ''}`}>
      <TileCategoryBar deck={deckLabel} category={categoryLabel} />
      <div className="sq-face-tile-body">
        {card ? (
          <CardTile card={card} onSelect={onClick} actionLabel={actionLabel} />
        ) : (
          <button type="button" className="sq-queue-tile is-fallback" onClick={onClick}>
            <span className="sq-tile-name">{actionLabel}</span>
          </button>
        )}
        {priceLabel ? (
          <span className="sq-price-badge" title={priceTitle || undefined}>
            {priceLabel}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** Full Out→In pair tile (builder chrome) + hover full-size popout. */
export function SwapPairQueueTile({
  outCard,
  inCard,
  incomplete,
  deckLabel,
  categoryLabel,
  actionLabel,
  cardWidthPx,
  onClick,
  onFinalize,
  inPriceLabel,
  inPriceTitle,
}: {
  outCard: CardView | null;
  inCard: CardView | null;
  incomplete?: boolean;
  deckLabel?: string | null;
  categoryLabel?: string | null;
  actionLabel: string;
  cardWidthPx: number;
  onClick?: () => void;
  /** Commit complete pair without opening edit. */
  onFinalize?: () => void;
  inPriceLabel?: string | null;
  inPriceTitle?: string | null;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [hover, setHover] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const popoutEligible = canShowHoverPopout();
  const popoutWidthPx = popoutEligible ? swapPairHoverPopoutWidthPx(cardWidthPx) : null;
  const showFinalize = Boolean(onFinalize && !incomplete && outCard && inCard);

  useLayoutEffect(() => {
    if (!hover || popoutWidthPx == null || !triggerRef.current) {
      setPos(null);
      return;
    }
    const rect = triggerRef.current.getBoundingClientRect();
    const gap = 10;
    const edge = 8;
    const popW = popoutWidthPx * 2 + 48;
    const popH = popoutWidthPx * 1.4 + (categoryLabel ? 40 : 24);
    let left = rect.left - popW - gap;
    if (left < edge) {
      left = rect.right + gap;
    }
    left = clamp(left, edge, window.innerWidth - popW - edge);
    const top = clamp(
      rect.top + rect.height / 2 - popH / 2,
      edge,
      window.innerHeight - popH - edge,
    );
    setPos({ top, left });
  }, [hover, popoutWidthPx, categoryLabel]);

  const popoutStyle = {
    ['--db-card-w']: `${popoutWidthPx ?? 0}px`,
    top: pos?.top ?? 0,
    left: pos?.left ?? 0,
  } as CSSProperties;

  return (
    <div className="sq-pair-tile">
      <button
        ref={triggerRef}
        type="button"
        className={`db-swap-pair${incomplete ? ' is-draft' : ''}`}
        onClick={onClick}
        onDragStart={blockDrag}
        onMouseEnter={() => {
          if (popoutEligible) setHover(true);
        }}
        onMouseLeave={() => setHover(false)}
        onFocus={() => {
          if (popoutEligible) setHover(true);
        }}
        onBlur={() => setHover(false)}
        title={actionLabel}
        aria-label={actionLabel}
      >
        <TileCategoryBar deck={deckLabel} category={categoryLabel} />
        <SwapPairFaces
          outCard={outCard}
          inCard={inCard}
          variant="preview"
          inPriceLabel={inPriceLabel}
          inPriceTitle={inPriceTitle}
        />
      </button>
      {showFinalize ? (
        <button
          type="button"
          className="db-btn sq-pair-finalize"
          aria-label={`Finalize swap, ${deckLabel || 'deck'}`}
          title="Remove Out and keep In in its target category"
          onClick={(e) => {
            e.stopPropagation();
            setConfirmOpen(true);
          }}
        >
          Finalize
        </button>
      ) : null}
      {confirmOpen && outCard && inCard ? (
        <FinalizeSwapConfirmDialog
          outName={cardDisplayName(outCard)}
          inName={cardDisplayName(inCard)}
          category={categoryLabel}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={() => {
            setConfirmOpen(false);
            onFinalize?.();
          }}
        />
      ) : null}
      {hover && popoutWidthPx != null && pos
        ? createPortal(
            <div
              className="db-swap-pair-popout"
              style={popoutStyle}
              role="presentation"
              aria-hidden="true"
            >
              <SwapPairFaces
                outCard={outCard}
                inCard={inCard}
                variant="popout"
                inPriceLabel={inPriceLabel}
                inPriceTitle={inPriceTitle}
              />
              {categoryLabel ? <span className="db-swap-target">→ {categoryLabel}</span> : null}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
