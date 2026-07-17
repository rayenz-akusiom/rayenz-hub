import {
  useCallback,
  useEffect,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import type { CardImageFace } from '@rayenz-hub/shared';
import { useCardFaceSession } from './CardFaceSession';
import { FoilIcon } from './FoilIcon';
import { ProxyIcon } from './ProxyIcon';

type ImgStatus = 'loading' | 'loaded' | 'error';

function statusForSrc(src: string | null | undefined): ImgStatus {
  return src ? 'loading' : 'error';
}

function useImageStatus(src: string | null | undefined) {
  const [status, setStatus] = useState<ImgStatus>(() => statusForSrc(src));

  useEffect(() => {
    setStatus(statusForSrc(src));
  }, [src]);

  const onLoad = useCallback(() => setStatus('loaded'), []);
  const onError = useCallback(() => setStatus('error'), []);

  const imgRef = useCallback(
    (el: HTMLImageElement | null) => {
      if (!el || !src) return;
      if (!el.complete) return;
      if (el.naturalWidth > 0) setStatus('loaded');
      else setStatus('error');
    },
    [src],
  );

  return { status, onLoad, onError, imgRef };
}

function CardMedia({
  src,
  name,
  alt,
  imgClassName,
  faceClassName,
}: {
  src?: string | null;
  name: string;
  alt: string;
  imgClassName: string;
  faceClassName?: string;
}) {
  const { status, onLoad, onError, imgRef } = useImageStatus(src);
  const faceMod = faceClassName ? ` ${faceClassName}` : '';

  if (!src || status === 'error') {
    return <span className={`db-card-fallback${faceMod}`}>{name}</span>;
  }

  const loading = status === 'loading';

  return (
    <span className={`db-card-media${faceMod}`}>
      {loading ? (
        <span className="db-card-skeleton db-skeleton-pulse" aria-hidden="true">
          <span className="db-card-skeleton-name">{name}</span>
        </span>
      ) : null}
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        loading="lazy"
        className={`${imgClassName}${loading ? ' is-loading' : ''}`}
        draggable={false}
        onLoad={onLoad}
        onError={onError}
      />
    </span>
  );
}

/** Shared card image + foil/proxy/qty badges used by tiles, minis, and pickers. */
export function CardFace({
  src,
  backSrc,
  name,
  foil = false,
  proxy = false,
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
  proxy?: boolean;
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
          <CardMedia
            src={src}
            name={name}
            alt={name}
            imgClassName={imgClassName}
            faceClassName="db-card-flip-face db-card-flip-face-front"
          />
          <CardMedia
            src={backSrc}
            name={name}
            alt={`${name} (back)`}
            imgClassName={imgClassName}
            faceClassName="db-card-flip-face db-card-flip-face-back"
          />
        </span>
      </span>
    ) : (
      <CardMedia src={src} name={name} alt={name} imgClassName={imgClassName} />
    );

  const showBottomBadges = canFlip || foil || proxy;

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
                <path fill="currentColor" d="M3 5.5 5.2 3.3v4.4Z" />
                <path
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13 10.5H5.5a2.5 2.5 0 0 1 0-5H8"
                />
                <path fill="currentColor" d="M13 10.5 10.8 12.7V8.3Z" />
              </svg>
            </span>
          ) : null}
          {proxy ? (
            <span className="db-badge db-badge-proxy" title="Proxy" aria-label="Proxy">
              <ProxyIcon filled />
            </span>
          ) : null}
          {foil ? (
            <span className="db-badge db-badge-foil" title="Foil" aria-label="Foil">
              <FoilIcon filled />
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
