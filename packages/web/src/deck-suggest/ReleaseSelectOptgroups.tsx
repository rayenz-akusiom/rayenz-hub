import type { ReleaseCatalogEntry } from '@rayenz-hub/shared';
import {
  formatReleaseOptionLabel,
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
  const { upcoming, groups, blocks } = partitionReleaseOptions(releases, now);

  return (
    <>
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
