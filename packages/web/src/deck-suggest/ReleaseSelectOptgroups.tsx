import type { ReleaseCatalogEntry } from '@rayenz-hub/shared';
import {
  formatReleaseOptionLabel,
  listReleaseOptions,
  partitionReleaseOptions,
} from './releases';

/** Shared `<optgroup>` tree for Suggest release `<select>`s. */
export function ReleaseSelectOptgroups({
  releases,
  now = new Date(),
}: {
  releases?: ReleaseCatalogEntry[];
  now?: Date;
}) {
  const all = releases ?? listReleaseOptions();
  const pinned = all.filter((r) => r.kind === 'pinned');
  const catalog = all.filter((r) => r.kind !== 'pinned');
  const { upcoming, groups, blocks } = partitionReleaseOptions(catalog, now);

  return (
    <>
      {pinned.length ? (
        <optgroup label="Pinned">
          {pinned.map((r) => (
            <option key={r.id} value={r.id}>
              {formatReleaseOptionLabel(r)}
            </option>
          ))}
        </optgroup>
      ) : null}
      {upcoming.length ? (
        <optgroup label="Upcoming">
          {upcoming.map((r) => (
            <option key={r.id} value={r.id}>
              {formatReleaseOptionLabel(r, { includeReleaseDate: true })}
            </option>
          ))}
        </optgroup>
      ) : null}
      {groups.length ? (
        <optgroup label="Groups">
          {groups.map((r) => (
            <option key={r.id} value={r.id}>
              {formatReleaseOptionLabel(r)}
            </option>
          ))}
        </optgroup>
      ) : null}
      {blocks.length ? (
        <optgroup label="Blocks">
          {blocks.map((r) => (
            <option key={r.id} value={r.id}>
              {formatReleaseOptionLabel(r)}
            </option>
          ))}
        </optgroup>
      ) : null}
    </>
  );
}
