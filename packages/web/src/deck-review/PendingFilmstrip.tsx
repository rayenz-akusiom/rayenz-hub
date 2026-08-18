import { useEffect, useRef } from 'react';
import type { Suggestion } from '@rayenz-hub/shared';
import { scryfallImageFromId, scryfallImageFromName, scryfallImageFromPrinting } from '@rayenz-hub/shared';

function suggestionInThumb(suggestion: Suggestion): string {
  const card = suggestion.card as {
    scryfall_id?: string;
    set_code?: string;
    collector_number?: string;
    name?: string;
  };
  if (card.scryfall_id) {
    return scryfallImageFromId(card.scryfall_id) || '';
  }
  if (card.set_code && card.collector_number) {
    return scryfallImageFromPrinting(card.set_code, card.collector_number) || '';
  }
  return scryfallImageFromName(card.name) || '';
}

function suggestionOutThumb(suggestion: Suggestion): string {
  const rep = (suggestion.replaces || [])[0] as
    | { name?: string; set_code?: string; collector_number?: string; scryfall_id?: string }
    | undefined;
  if (!rep?.name) {
    return '';
  }
  if (rep.scryfall_id) {
    return scryfallImageFromId(rep.scryfall_id) || '';
  }
  if (rep.set_code && rep.collector_number) {
    return scryfallImageFromPrinting(rep.set_code, rep.collector_number) || '';
  }
  return scryfallImageFromName(rep.name) || '';
}

export function PendingFilmstrip({
  pending,
  activeIndex,
  onJump,
}: {
  pending: Suggestion[];
  activeIndex: number;
  onJump: (index: number) => void;
}) {
  const stripRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) {
      return;
    }
    const active = strip.querySelector('.dr-filmstrip-item.is-active') as HTMLElement | null;
    if (active && typeof active.scrollIntoView === 'function') {
      active.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    }
  }, [activeIndex, pending.length]);

  if (pending.length < 2) {
    return null;
  }

  return (
    <div className="dr-filmstrip" aria-label="Pending suggestions">
      <div className="dr-filmstrip-track" ref={stripRef}>
        {pending.map((s, i) => {
          const card = s.card as { name?: string };
          const inSrc = suggestionInThumb(s);
          const outSrc = suggestionOutThumb(s);
          const label = (card.name || 'Suggestion') + (outSrc ? ' → cut' : '');
          return (
            <button
              key={String(s.suggestion_id)}
              type="button"
              className={'dr-filmstrip-item' + (i === activeIndex ? ' is-active' : '')}
              aria-current={i === activeIndex ? 'true' : undefined}
              aria-label={`Suggestion ${i + 1}: ${label}`}
              title={label}
              onClick={() => onJump(i)}
            >
              <span className="dr-filmstrip-pair">
                {inSrc ? <img src={inSrc} alt="" /> : <span className="dr-filmstrip-empty" />}
                <span className="dr-filmstrip-arrow" aria-hidden="true">
                  →
                </span>
                {outSrc ? <img src={outSrc} alt="" /> : <span className="dr-filmstrip-empty" />}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
