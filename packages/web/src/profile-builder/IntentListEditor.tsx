import { useState } from 'react';

type Props = {
  title: string;
  items: string[];
  onChange: (items: string[]) => void;
  addLabel?: string;
  placeholder?: string;
};

export function IntentListEditor({
  title,
  items,
  onChange,
  addLabel = 'Add',
  placeholder = '',
}: Props) {
  const [draft, setDraft] = useState('');

  function addItem() {
    const value = draft.trim();
    if (!value) return;
    const key = value.toLowerCase();
    if (items.some((t) => t.toLowerCase() === key)) {
      setDraft('');
      return;
    }
    onChange([...items, value]);
    setDraft('');
  }

  function removeItem(name: string) {
    onChange(items.filter((t) => t.toLowerCase() !== name.toLowerCase()));
  }

  return (
    <div className="pb-intent-list">
      <h4>{title}</h4>
      {items.length ? (
        <ul className="pb-intent-chips">
          {items.map((item) => (
            <li key={item}>
              <span>{item}</span>
              <button
                type="button"
                className="ds-btn ds-btn-sm"
                aria-label={`Remove ${item}`}
                onClick={() => removeItem(item)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="ds-meta">None yet.</p>
      )}
      <div className="pb-intent-add">
        <input
          type="text"
          value={draft}
          placeholder={placeholder}
          aria-label={`${title} value`}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addItem();
            }
          }}
        />
        <button type="button" className="ds-btn ds-btn-sm" onClick={addItem}>
          {addLabel}
        </button>
      </div>
    </div>
  );
}
