import { Children, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useCardSize } from '../card-size';

function parseCssLengthPx(value: string, fallback: number): number {
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  const n = parseFloat(trimmed);
  if (!Number.isFinite(n)) return fallback;
  if (trimmed.endsWith('rem')) {
    const root = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    return n * root;
  }
  return n;
}

/** Responsive LTR masonry: round-robin items into N vertical tracks from available width. */
export function MasonryColumns({ children }: { children: ReactNode }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [cols, setCols] = useState(1);
  const items = useMemo(() => Children.toArray(children), [children]);
  const { widthPx } = useCardSize();

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    function measure() {
      if (!host) return;
      // Measure the host (100% of the constrained main pane), not the flex
      // row of tracks — those expand with content and create a feedback loop.
      const styles = getComputedStyle(host);
      const cardW = parseCssLengthPx(styles.getPropertyValue('--db-card-w'), widthPx);
      const gap = parseCssLengthPx(styles.getPropertyValue('--db-cat-gap'), 8);
      const width = host.clientWidth;
      const next = Math.max(1, Math.floor((width + gap) / (cardW + gap)));
      setCols((prev) => (prev === next ? prev : next));
    }

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(host);
    return () => ro.disconnect();
  }, [widthPx]);

  const tracks = useMemo(() => {
    const buckets: ReactNode[][] = Array.from({ length: cols }, () => []);
    items.forEach((item, i) => {
      buckets[i % cols].push(item);
    });
    return buckets;
  }, [items, cols]);

  return (
    <div ref={hostRef} className="db-cat-columns-host">
      <div className="db-cat-columns">
        {tracks.map((nodes, i) => (
          <div key={i} className="db-cat-column-track">
            {nodes}
          </div>
        ))}
      </div>
    </div>
  );
}
