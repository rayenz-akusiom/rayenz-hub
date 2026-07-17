/**
 * Hub document root helpers for resolving static asset URLs (CSS, etc.).
 */
export function hubDocumentRootFromEntry(entrySrc: string | null | undefined): string {
  if (entrySrc) {
    const assetsIdx = entrySrc.lastIndexOf('/assets/');
    if (assetsIdx !== -1) {
      return entrySrc.slice(0, assetsIdx + 1);
    }
    const hubIdx = entrySrc.lastIndexOf('/src/hub/');
    if (hubIdx !== -1) {
      return entrySrc.slice(0, hubIdx + 1);
    }
  }

  const base = import.meta.env.BASE_URL || './';
  if (base.startsWith('/')) {
    const normalized = base.endsWith('/') ? base : `${base}/`;
    return new URL(normalized, window.location.origin).href;
  }

  return `${window.location.origin}/`;
}

export function hubDocumentRoot(): string {
  const entry = document.querySelector<HTMLScriptElement>(
    'script[type="module"][src*="/assets/"], script[type="module"][src*="/src/hub/"]',
  );
  return hubDocumentRootFromEntry(entry?.src);
}

/** Resolve a path against an explicit entry URL (for tests). */
export function urlFromEntry(path: string, entrySrc: string): string {
  return new URL(path, hubDocumentRootFromEntry(entrySrc)).href;
}

/** @deprecated Use urlFromEntry */
export function scriptUrlFromEntry(src: string, entrySrc: string): string {
  return urlFromEntry(src, entrySrc);
}
