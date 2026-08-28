import { useState } from 'react';
import type { SnapshotCard } from '../deck-suggest/types';

const MAYBEBOARD = 'Maybeboard';

export function mainDeckCards(cards: SnapshotCard[] | undefined): SnapshotCard[] {
  return (cards || []).filter((c) => {
    const cats = c.categories || [];
    if (cats.some((cat) => String(cat).toLowerCase() === MAYBEBOARD.toLowerCase())) return false;
    return Boolean(c.name);
  });
}

type Props = {
  cards: SnapshotCard[];
  selected: string[];
  max?: number;
  onChange: (names: string[]) => void;
};

export function RepresentativeCardPicker({ cards, selected, max = 5, onChange }: Props) {
  const [filter, setFilter] = useState('');
  const needle = filter.trim().toLowerCase();
  const visible = cards.filter((c) => !needle || String(c.name).toLowerCase().includes(needle));

  function toggle(name: string) {
    const key = name.toLowerCase();
    const has = selected.some((n) => n.toLowerCase() === key);
    if (has) {
      onChange(selected.filter((n) => n.toLowerCase() !== key));
      return;
    }
    if (selected.length >= max) return;
    onChange([...selected, name]);
  }

  return (
    <div className="pb-card-picker">
      <label className="ds-field">
        Search cards
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter by name…"
        />
      </label>
      <p className="ds-meta" id="pb-rep-count">
        {selected.length} of {max} selected
      </p>
      <div className="pb-card-grid" role="list">
        {visible.map((card) => {
          const name = String(card.name);
          const pressed = selected.some((n) => n.toLowerCase() === name.toLowerCase());
          const disabled = !pressed && selected.length >= max;
          return (
            <button
              key={name}
              type="button"
              role="listitem"
              className={'pb-card-toggle' + (pressed ? ' active' : '')}
              aria-pressed={pressed}
              aria-label={name}
              disabled={disabled}
              onClick={() => toggle(name)}
            >
              {name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
