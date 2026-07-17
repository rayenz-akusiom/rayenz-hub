import { useState, type KeyboardEvent, type MouseEvent } from 'react';
import type { CardImageFace } from '@rayenz-hub/shared';
import { useCardFaceSession } from './CardFaceSession';

/** Shared card image + foil/qty badges used by tiles, minis, and pickers. */
export function CardFace({
  src,
  backSrc,
  name,
  foil = false,
  quantity = 1,
  imgClassName = 'db-card-img',
  faceKey,
  doubleFaced = false,
}: {
  src?: string | null;
  /** Back-face image URL when the card is dual-faced. */
  backSrc?: string | null;
  name: string;
  foil?: boolean;
  quantity?: number;
  imgClassName?: string;
  /** Session key for remembering front/back across moves (instanceId or scryfall id). */
  faceKey?: string;
  doubleFaced?: boolean;
}) {
  const qty = Number(quantity) || 1;
  const canFlip = Boolean(doubleFaced && src && backSrc);
  const session = useCardFaceSession();
  const [localFace, setLocalFace] = useState<CardImageFace>('front');

  const face: CardImageFace =
    canFlip && faceKey && session ? session.getFace(faceKey) : localFace;
  const showingBack = canFlip && face === 'back';

  function setFace(next: CardImageFace) {
    if (faceKey && session) session.setFace(faceKey, next);
    else setLocalFace(next);
  }

  function flip(e: MouseEvent | KeyboardEvent) {
    e.preventDefault();
    e.stopPropagation();
    setFace(showingBack ? 'front' : 'back');
  }

  function onFlipKeyDown(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') flip(e);
  }

  const imageBlock =
    src && canFlip ? (
      <span className={`db-card-flipper${showingBack ? ' is-back' : ''}`}>
        <span className="db-card-flip-inner">
          <img
            src={src}
            alt={name}
            loading="lazy"
            className={`${imgClassName} db-card-flip-face db-card-flip-face-front`}
            draggable={false}
          />
          <img
            src={backSrc!}
            alt={`${name} (back)`}
            loading="lazy"
            className={`${imgClassName} db-card-flip-face db-card-flip-face-back`}
            draggable={false}
          />
        </span>
      </span>
    ) : src ? (
      <img src={src} alt={name} loading="lazy" className={imgClassName} draggable={false} />
    ) : (
      <span className="db-card-fallback">{name}</span>
    );

  const showBottomBadges = canFlip || foil;

  return (
    <>
      {imageBlock}
      {showBottomBadges ? (
        <span className="db-card-badges db-card-badges-corner">
          {canFlip ? (
            <span
              className="db-badge db-badge-flip"
              role="button"
              tabIndex={0}
              title={showingBack ? 'Show front face' : 'Show back face'}
              aria-label={showingBack ? 'Show front face' : 'Show back face'}
              aria-pressed={showingBack}
              onClick={flip}
              onKeyDown={onFlipKeyDown}
              onMouseDown={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <svg className="db-badge-flip-icon" viewBox="0 0 16 16" aria-hidden="true">
                <path
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 5.5h7.5a2.5 2.5 0 0 1 0 5H8"
                />
                <path
                  fill="currentColor"
                  d="M3 5.5 5.2 3.3v4.4Z"
                />
                <path
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13 10.5H5.5a2.5 2.5 0 0 1 0-5H8"
                />
                <path
                  fill="currentColor"
                  d="M13 10.5 10.8 12.7V8.3Z"
                />
              </svg>
            </span>
          ) : null}
          {foil ? (
            <span className="db-badge db-badge-foil" title="Foil" aria-label="Foil">
              <svg className="db-badge-foil-icon" viewBox="0 0 16 16" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M8 1.5 12.5 6 8 14.5 3.5 6Z"
                  opacity="0.35"
                />
                <path fill="currentColor" d="M8 1.5 12.5 6H8Z" />
                <path fill="currentColor" d="M8 1.5 3.5 6H8Z" opacity="0.75" />
                <path fill="currentColor" d="M3.5 6 8 14.5 8 6Z" opacity="0.55" />
                <path fill="currentColor" d="M12.5 6 8 6 8 14.5Z" opacity="0.85" />
                <path
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="0.6"
                  d="M8 1.5 12.5 6 8 14.5 3.5 6Z"
                />
                <path
                  fill="currentColor"
                  d="M13.2 2.2 13.7 3.5 15 4 13.7 4.5 13.2 5.8 12.7 4.5 11.4 4 12.7 3.5Z"
                />
                <path
                  fill="currentColor"
                  d="M2.5 9.5 2.85 10.4 3.75 10.75 2.85 11.1 2.5 12 2.15 11.1 1.25 10.75 2.15 10.4Z"
                />
              </svg>
            </span>
          ) : null}
        </span>
      ) : null}
      {qty > 1 ? (
        <span className="db-card-badges db-card-badges-qty">
          <span className="db-badge db-badge-qty">×{qty}</span>
        </span>
      ) : null}
    </>
  );
}
