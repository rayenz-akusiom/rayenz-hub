/** Spyglass icon for Seeking — filled (badge / active) or empty outline (toggle). */
export function SeekingIcon({
  filled = true,
  className = 'db-badge-seeking-icon',
}: {
  filled?: boolean;
  className?: string;
}) {
  if (filled) {
    return (
      <svg className={className} viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="7" cy="7" r="3.75" fill="currentColor" opacity="0.22" />
        <circle
          cx="7"
          cy="7"
          r="3.75"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.35"
        />
        <path
          fill="none"
          stroke="currentColor"
          strokeWidth="1.35"
          strokeLinecap="round"
          d="M9.8 9.8 13.2 13.2"
        />
        <circle cx="7" cy="7" r="1.1" fill="currentColor" />
      </svg>
    );
  }

  return (
    <svg className={className} viewBox="0 0 16 16" aria-hidden="true">
      <circle
        cx="7"
        cy="7"
        r="3.75"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        d="M9.8 9.8 13.2 13.2"
      />
    </svg>
  );
}
