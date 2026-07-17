import {
  CARD_SIZE_GLYPHS,
  CARD_SIZE_KEYS,
  CARD_SIZE_LABELS,
  type CardSizeKey,
  useCardSize,
} from './card-size';

function SizeGlyph({ px }: { px: number }) {
  return (
    <svg
      width={px}
      height={Math.round(px * 1.39)}
      viewBox="0 0 12 17"
      aria-hidden="true"
    >
      <rect
        x="1"
        y="1"
        width="10"
        height="15"
        rx="1.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

export function CardSizePicker({
  size: sizeProp,
  onChange,
}: {
  /** Controlled size; when omitted, uses shared localStorage preference. */
  size?: CardSizeKey;
  onChange?: (next: CardSizeKey) => void;
} = {}) {
  const hook = useCardSize();
  const size = sizeProp ?? hook.size;
  const setSize = onChange ?? hook.setSize;

  return (
    <div className="db-card-size-group" role="group" aria-label="Card size">
      {CARD_SIZE_KEYS.map((key) => {
        const label = CARD_SIZE_LABELS[key];
        return (
          <button
            key={key}
            type="button"
            className={`db-card-size-btn${size === key ? ' is-active' : ''}`}
            aria-label={label}
            title={label}
            aria-pressed={size === key}
            onClick={() => setSize(key)}
          >
            <SizeGlyph px={CARD_SIZE_GLYPHS[key]} />
          </button>
        );
      })}
    </div>
  );
}
