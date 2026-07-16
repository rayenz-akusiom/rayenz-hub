import type { CardInstance } from '@rayenz-hub/shared';

export function SwapCardPicker({
  cards,
  value,
  onChange,
}: {
  cards: CardInstance[];
  value: string | null;
  onChange: (instanceId: string | null) => void;
}) {
  return (
    <select
      value={value || ''}
      onChange={(e) => onChange(e.target.value || null)}
      className="db-select"
    >
      <option value="">—</option>
      {cards.map((c) => (
        <option key={c.instanceId} value={c.instanceId}>
          {c.name} ({c.primaryCategory})
        </option>
      ))}
    </select>
  );
}
