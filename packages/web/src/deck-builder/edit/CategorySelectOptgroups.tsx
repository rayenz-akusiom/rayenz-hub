import {
  groupCategorySelectOptions,
  type DeckFormat,
} from '@rayenz-hub/shared';

/** Custom-then-Default `<optgroup>`s for deck-builder category `<select>`s. */
export function CategorySelectOptgroups({
  names,
  format,
  categoryOrder,
}: {
  names: string[];
  format: DeckFormat;
  categoryOrder?: string[];
}) {
  const { custom, defaults } = groupCategorySelectOptions(names, { format, categoryOrder });

  return (
    <>
      {custom.length ? (
        <optgroup label="Custom">
          {custom.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </optgroup>
      ) : null}
      {defaults.length ? (
        <optgroup label="Default">
          {defaults.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </optgroup>
      ) : null}
    </>
  );
}
