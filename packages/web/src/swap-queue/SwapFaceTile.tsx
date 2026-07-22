import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import type { CardView } from '@rayenz-hub/shared';
import { CardTile } from '../deck-builder/browse/CardTile';
import { SwapPairFaces } from '../deck-builder/swaps/swap-pair-faces';

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function blockDrag(e: React.DragEvent) {
  e.preventDefault();
  e.stopPropagation();
}

/** Reserved light bar for target category (not deck name). */
export function TileCategoryBar({ category }: { category?: string | null }) {
  return (
    <div className="sq-tile-cat-bar">
      <span className="sq-tile-cat-target">{category?.trim() ? category : '\u00a0'}</span>
    </div>
  );
}

/** Single-face tile with category bar (Stacked / Grid / Seeking). */
export function SwapFaceTile({
  card,
  incomplete,
  categoryLabel,
  actionLabel,
  onClick,
}: {
  card: CardView | null;
  incomplete?: boolean;
  categoryLabel?: string | null;
  actionLabel: string;
  onClick?: () => void;
}) {
  return (
    <div className={`sq-face-tile${incomplete ? ' is-draft' : ''}`}>
      <TileCategoryBar category={categoryLabel} />
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
  categoryLabel,
  actionLabel,
  cardWidthPx,
  onClick,
}: {
  outCard: CardView | null;
  inCard: CardView | null;
  incomplete?: boolean;
  categoryLabel?: string | null;
  actionLabel: string;
  cardWidthPx: number;
  onClick?: () => void;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [hover, setHover] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!hover || !triggerRef.current) {
      setPos(null);
      return;
    }
    const rect = triggerRef.current.getBoundingClientRect();
    const gap = 10;
    const edge = 8;
    const popW = cardWidthPx * 2 + 48;
    const popH = cardWidthPx * 1.4 + (categoryLabel ? 40 : 24);
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
  }, [hover, cardWidthPx, categoryLabel]);

  const popoutStyle = {
    ['--db-card-w']: `${cardWidthPx}px`,
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
        <TileCategoryBar category={categoryLabel} />
        <SwapPairFaces outCard={outCard} inCard={inCard} variant="preview" />
      </button>
      {hover && pos
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
