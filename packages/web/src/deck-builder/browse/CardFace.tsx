/** Shared card image + foil/qty badges used by tiles, minis, and pickers. */
export function CardFace({
  src,
  name,
  foil = false,
  quantity = 1,
  imgClassName = 'db-card-img',
}: {
  src?: string | null;
  name: string;
  foil?: boolean;
  quantity?: number;
  imgClassName?: string;
}) {
  const qty = Number(quantity) || 1;

  return (
    <>
      {src ? (
        <img src={src} alt={name} loading="lazy" className={imgClassName} draggable={false} />
      ) : (
        <span className="db-card-fallback">{name}</span>
      )}
      {foil ? (
        <span className="db-card-badges db-card-badges-foil">
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
