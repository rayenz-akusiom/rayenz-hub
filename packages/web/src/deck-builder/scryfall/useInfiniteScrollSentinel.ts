import { useEffect, useRef, type RefObject } from 'react';

/**
 * Observe a sentinel inside a scroll root and call onLoadMore when it intersects,
 * while enabled and not loading.
 */
export function useInfiniteScrollSentinel({
  rootRef,
  enabled,
  loading,
  onLoadMore,
}: {
  rootRef: RefObject<HTMLElement | null>;
  enabled: boolean;
  loading: boolean;
  onLoadMore: () => void;
}): RefObject<HTMLDivElement | null> {
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const onLoadMoreRef = useRef(onLoadMore);
  onLoadMoreRef.current = onLoadMore;
  const loadingRef = useRef(loading);
  loadingRef.current = loading;

  useEffect(() => {
    const root = rootRef.current;
    const sentinel = sentinelRef.current;
    if (!enabled || !root || !sentinel || typeof IntersectionObserver === 'undefined') {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        if (loadingRef.current) return;
        onLoadMoreRef.current();
      },
      { root, rootMargin: '120px', threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [rootRef, enabled]);

  return sentinelRef;
}
