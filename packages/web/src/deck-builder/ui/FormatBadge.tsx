import type { DeckFormat } from '@rayenz-hub/shared';

/** Commander's Arsenal (cm1) set symbol from Scryfall. */
const CM1_SET_ICON = 'https://svgs.scryfall.io/sets/cm1.svg';

const FORMAT_LABEL: Record<DeckFormat, string> = {
  commander: 'Commander',
  cube: 'Cube',
  pendragon: 'Pendragon',
  other: 'Other',
};

function CubeIcon() {
  return (
    <svg className="db-format-icon-svg" viewBox="0 0 16 16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M8 1.2 14.2 4.5v7L8 14.8 1.8 11.5v-7L8 1.2zm0 1.5L3.2 5.2v5.6L8 13.3l4.8-2.5V5.2L8 2.7z"
        opacity="0.35"
      />
      <path
        fill="currentColor"
        d="M8 1.2 14.2 4.5 8 7.8 1.8 4.5 8 1.2zm0 6.6 6.2-3.3v7L8 14.8V7.8zm0 0L1.8 4.5v7L8 14.8V7.8z"
      />
    </svg>
  );
}

function PendragonIcon() {
  return (
    <svg className="db-format-icon-svg" viewBox="0 0 16 16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M8.2 1.2 9.6 5.4h4.4l-3.6 2.6 1.4 4.3L8.2 9.8 4.2 12.3l1.4-4.3L2 5.4h4.4L8.2 1.2z"
        opacity="0.35"
      />
      <path
        fill="currentColor"
        d="M7.5 1.4h1v9.2h-1zM5.2 11.2h5.6v1.1H5.2zm-1 1.6h7.6v1.2H4.2z"
      />
    </svg>
  );
}

function OtherIcon() {
  return (
    <svg className="db-format-icon-svg" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="8" cy="8" r="1.5" fill="currentColor" />
    </svg>
  );
}

export function FormatBadge({
  format,
  showLabel = false,
  className = '',
}: {
  format: DeckFormat;
  /** When true, show a short text label beside the icon (useful for Cube/Other). */
  showLabel?: boolean;
  className?: string;
}) {
  const label = FORMAT_LABEL[format] || 'Other';

  return (
    <span
      className={`db-format-badge${className ? ` ${className}` : ''}`}
      title={label}
      aria-label={label}
    >
      {format === 'commander' ? (
        <img
          className="db-format-icon-img"
          src={CM1_SET_ICON}
          alt=""
          width={16}
          height={16}
          loading="lazy"
        />
      ) : format === 'cube' ? (
        <CubeIcon />
      ) : format === 'pendragon' ? (
        <PendragonIcon />
      ) : (
        <OtherIcon />
      )}
      {showLabel ? <span className="db-format-badge-label">{label}</span> : null}
    </span>
  );
}

export function formatDisplayName(format: DeckFormat): string {
  return FORMAT_LABEL[format] || 'Other';
}
