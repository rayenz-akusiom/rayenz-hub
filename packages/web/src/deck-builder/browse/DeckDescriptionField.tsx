import { useEffect, useRef, useState } from 'react';
import { clampDeckDescription } from '@rayenz-hub/shared';

export function DeckDescriptionField({
  value,
  onChange,
}: {
  value: string;
  onChange?: (next: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setDraft(value);
  }, [value]);

  if (!onChange) {
    if (!value.trim()) return null;
    return (
      <div className="db-deck-description">
        <p className="db-deck-description-text">{value}</p>
      </div>
    );
  }

  return (
    <div className="db-deck-description">
      <textarea
        className="db-deck-description-input"
        aria-label="Deck description"
        placeholder="Add a description…"
        value={draft}
        onChange={(e) => setDraft(clampDeckDescription(e.target.value))}
        onFocus={() => {
          focused.current = true;
        }}
        onBlur={() => {
          focused.current = false;
          const next = clampDeckDescription(draft);
          setDraft(next);
          if (next !== value) onChange(next);
        }}
      />
    </div>
  );
}
