import { useCallback, useEffect, useState } from 'react';
import type { DeckSummary } from '@rayenz-hub/shared';

export function PartnerTie({ illegal }: { illegal?: boolean }) {
  return (
    <span
      className={`db-partner-tie${illegal ? ' is-illegal' : ''}`}
      aria-hidden="true"
      title={illegal ? 'These commanders can’t partner' : undefined}
    >
      <svg viewBox="0 0 24 24" width="1em" height="1em" focusable="false">
        <path
          fill="currentColor"
          d="M7 12a4 4 0 0 1 4-4h2v2h-2a2 2 0 1 0 0 4h2v2h-2a4 4 0 0 1-4-4zm6-4h2a4 4 0 0 1 0 8h-2v-2h2a2 2 0 0 0 0-4h-2V8z"
        />
      </svg>
    </span>
  );
}

type CoverImgStatus = 'loading' | 'loaded' | 'error';

function LibraryCoverImage({ src, label }: { src: string; label: string }) {
  const [status, setStatus] = useState<CoverImgStatus>('loading');

  useEffect(() => {
    setStatus('loading');
  }, [src]);

  const imgRef = useCallback((el: HTMLImageElement | null) => {
    if (!el) return;
    if (!el.complete) return;
    if (el.naturalWidth > 0) setStatus('loaded');
    else setStatus('error');
  }, []);

  if (status === 'error') {
    return <span className="db-library-tile-fallback">{label}</span>;
  }

  const loading = status === 'loading';

  return (
    <span className="db-library-cover-media">
      {loading ? (
        <span className="db-card-skeleton db-skeleton-pulse" aria-hidden="true">
          <span className="db-card-skeleton-name">{label}</span>
        </span>
      ) : null}
      <img
        ref={imgRef}
        src={src}
        alt=""
        loading="lazy"
        className={loading ? 'is-loading' : undefined}
        onLoad={() => setStatus('loaded')}
        onError={() => setStatus('error')}
      />
    </span>
  );
}

export function LibraryCoverArt({ deck }: { deck: DeckSummary }) {
  const dual = Boolean(deck.coverImageUrl && deck.coverImageUrlSecondary);
  const illegal = deck.coverPartnerStatus === 'illegal';

  if (!deck.coverImageUrl) {
    return (
      <span className="db-library-tile-art" aria-hidden="true">
        <span className="db-library-tile-fallback">{deck.name}</span>
      </span>
    );
  }

  if (!dual) {
    return (
      <span className="db-library-tile-art" aria-hidden="true">
        <LibraryCoverImage src={deck.coverImageUrl} label={deck.name} />
      </span>
    );
  }

  return (
    <span
      className={`db-library-tile-art is-partner-pair${illegal ? ' is-illegal' : ''}`}
      aria-hidden="true"
    >
      <span className="db-library-tile-face">
        <LibraryCoverImage src={deck.coverImageUrl} label={deck.name} />
      </span>
      <PartnerTie illegal={illegal} />
      <span className="db-library-tile-face">
        <LibraryCoverImage src={deck.coverImageUrlSecondary!} label={deck.name} />
      </span>
    </span>
  );
}
