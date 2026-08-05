import type { LibrarySort } from './library-sort';

const SKELETON_TILE_COUNT = 8;

export function LibrarySkeleton() {
  return (
    <div
      className="db-library-skeleton"
      aria-busy="true"
      aria-label="Loading library"
      role="status"
    >
      <div className="db-library-section-title db-skeleton-title">
        <span className="db-skeleton-pulse db-skeleton-line db-skeleton-line-title" />
      </div>
      <ul className="db-library-grid" aria-hidden="true">
        {Array.from({ length: SKELETON_TILE_COUNT }, (_, i) => (
          <li key={i} className="db-library-tile db-skeleton-tile">
            <span className="db-library-tile-art db-skeleton-pulse db-skeleton-art" />
            <span className="db-library-tile-caption">
              <span className="db-skeleton-pulse db-skeleton-line db-skeleton-line-badge" />
              <span className="db-skeleton-pulse db-skeleton-line db-skeleton-line-name" />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function LibrarySortSelect({
  sort,
  onChange,
}: {
  sort: LibrarySort;
  onChange: (next: LibrarySort) => void;
}) {
  return (
    <label className="db-library-sort">
      <span className="db-library-sort-label">Sort</span>
      <select
        className="db-select"
        aria-label="Library sort"
        value={sort}
        onChange={(e) => onChange(e.target.value as LibrarySort)}
      >
        <option value="recent">Recent</option>
        <option value="name">A–Z</option>
        <option value="cover">A–Z (Highlighted Card)</option>
      </select>
    </label>
  );
}
