type TrimEffect = 'maybeboard' | 'delete';

export function TrimModeFab({
  sizeLabel,
  trimOver,
  trimEffect,
  onTrimEffectChange,
  onDone,
}: {
  sizeLabel: string;
  trimOver: number;
  trimEffect: TrimEffect;
  onTrimEffectChange: (effect: TrimEffect) => void;
  onDone: () => void;
}) {
  const legal = trimOver <= 0;
  const toneClass = trimEffect === 'delete' ? ' is-trim-delete' : '';

  return (
    <div
      className={`db-add-fab db-add-fab-drop db-trim-fab${toneClass}`}
      role="group"
      aria-label="Trim mode controls"
    >
      <div className="db-trim-fab-status">
        <strong className="db-trim-fab-title">Trim mode</strong>
        <span className="db-trim-fab-copy">
          {sizeLabel}
          {legal ? ' · legal' : ` · trim ${trimOver}`}
        </span>
        <span className="db-trim-fab-hint">
          {trimEffect === 'delete'
            ? 'Click a card to delete it'
            : 'Click a card to move it to Maybeboard'}
        </span>
      </div>
      <button
        type="button"
        className={`db-add-fab-zone${trimEffect === 'maybeboard' ? ' is-drop-target' : ''}`}
        aria-pressed={trimEffect === 'maybeboard'}
        onClick={() => onTrimEffectChange('maybeboard')}
      >
        Maybeboard
      </button>
      <button
        type="button"
        className={`db-add-fab-zone db-trim-fab-danger${trimEffect === 'delete' ? ' is-drop-target' : ''}`}
        aria-pressed={trimEffect === 'delete'}
        onClick={() => onTrimEffectChange('delete')}
      >
        Delete
      </button>
      <button type="button" className="db-add-fab-zone" onClick={onDone}>
        Done
      </button>
    </div>
  );
}
