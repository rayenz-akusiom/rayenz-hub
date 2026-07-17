/** Sketch-card icon for proxy — filled (badge / active) or empty outline (toggle). */
export function ProxyIcon({
  filled = true,
  className = 'db-badge-proxy-icon',
}: {
  filled?: boolean;
  className?: string;
}) {
  if (filled) {
    return (
      <svg className={className} viewBox="0 0 16 16" aria-hidden="true">
        <rect
          x="3.25"
          y="1.75"
          width="9.5"
          height="12.5"
          rx="1.2"
          fill="currentColor"
          opacity="0.18"
        />
        <rect
          x="3.25"
          y="1.75"
          width="9.5"
          height="12.5"
          rx="1.2"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.15"
          strokeDasharray="2.2 1.4"
        />
        <path
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
          strokeLinecap="round"
          d="M5.5 5.2h5M5.5 7.5h3.8M5.5 9.8h4.2"
          opacity="0.7"
        />
        <path
          fill="none"
          stroke="currentColor"
          strokeWidth="1.1"
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M11.2 11.6 12.6 13.4l1.1-.35"
        />
      </svg>
    );
  }

  return (
    <svg className={className} viewBox="0 0 16 16" aria-hidden="true">
      <rect
        x="3.25"
        y="1.75"
        width="9.5"
        height="12.5"
        rx="1.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.15"
        strokeDasharray="2.2 1.4"
      />
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        d="M5.5 5.2h5M5.5 7.5h3.8M5.5 9.8h4.2"
        opacity="0.55"
      />
    </svg>
  );
}
