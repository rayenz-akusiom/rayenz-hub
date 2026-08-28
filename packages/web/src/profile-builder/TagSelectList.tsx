import { useState } from 'react';

type Props = {
  tags: string[];
  byCard: Record<string, string[]>;
  selected: string[];
  onChange: (tags: string[]) => void;
  max?: number;
};

export function TagSelectList({ tags, byCard, selected, onChange, max = 20 }: Props) {
  const [expanded, setExpanded] = useState(false);

  function toggle(tag: string) {
    const key = tag.toLowerCase();
    const has = selected.some((t) => t.toLowerCase() === key);
    if (has) {
      onChange(selected.filter((t) => t.toLowerCase() !== key));
      return;
    }
    if (selected.length >= max) return;
    onChange([...selected, tag]);
  }

  if (!tags.length) {
    return (
      <p className="ds-meta" id="pb-tags-empty">
        No Scryfall oracle tags found for these cards. You can still save representative cards.
      </p>
    );
  }

  return (
    <div className="pb-tag-select">
      <fieldset>
        <legend>Profile tags</legend>
        <div className="pb-tag-list">
          {tags.map((tag) => {
            const checked = selected.some((t) => t.toLowerCase() === tag.toLowerCase());
            const disabled = !checked && selected.length >= max;
            return (
              <label key={tag} className="pb-tag-option">
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={disabled}
                  onChange={() => toggle(tag)}
                />
                {tag}
              </label>
            );
          })}
        </div>
      </fieldset>
      {Object.keys(byCard).length ? (
        <button
          type="button"
          className="ds-btn ds-btn-sm"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? 'Hide per-card tags' : 'Show per-card tags'}
        </button>
      ) : null}
      {expanded ? (
        <ul className="pb-by-card">
          {Object.entries(byCard).map(([name, cardTags]) => (
            <li key={name}>
              <strong>{name}</strong>: {cardTags.length ? cardTags.join(', ') : '—'}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
