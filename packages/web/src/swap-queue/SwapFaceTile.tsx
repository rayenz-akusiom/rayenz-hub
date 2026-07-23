import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type { CardView } from '@rayenz-hub/shared';
import { swapPairHoverPopoutWidthPx } from '../deck-builder/card-size';
import { CardTile } from '../deck-builder/browse/CardTile';
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
}: {
  card: CardView | null;
  incomplete?: boolean;
  deckLabel?: string | null;
  categoryLabel?: string | null;
  actionLabel: string;
  onClick?: () => void;
}) {
  return (
    <div className={`sq-face-tile${incomplete ? ' is-draft' : ''}`}>
      <TileCategoryBar deck={deckLabel} category={categoryLabel} />
      {card ? (
        <CardTile card={card} onSelect={onClick} actionLabel={actionLabel} />
      ) : (
        <button type="button" className="sq-queue-tile is-fallback" onClick={onClick}>
          <span className="sq-tile-name">{actionLabel}</span>
        </button>
      )}
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
}: {
  outCard: CardView | null;
  inCard: CardView | null;
  incomplete?: boolean;
  deckLabel?: string | null;
  categoryLabel?: string | null;
  actionLabel: string;
  cardWidthPx: number;
  onClick?: () => void;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [hover, setHover] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const popoutWidthPx = swapPairHoverPopoutWidthPx(cardWidthPx);

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
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`db-swap-pair${incomplete ? ' is-draft' : ''}`}
        onClick={onClick}
        onDragStart={blockDrag}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onFocus={() => setHover(true)}
        onBlur={() => setHover(false)}
        title={actionLabel}
        aria-label={actionLabel}
      >
        <TileCategoryBar deck={deckLabel} category={categoryLabel} />
        <SwapPairFaces outCard={outCard} inCard={inCard} variant="preview" />
      </button>
      {hover && popoutWidthPx != null && pos
        ? createPortal(
            <div
              className="db-swap-pair-popout"
              style={popoutStyle}
              role="presentation"
              aria-hidden="true"
            >
              <SwapPairFaces outCard={outCard} inCard={inCard} variant="popout" />
              {categoryLabel ? <span className="db-swap-target">→ {categoryLabel}</span> : null}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
