/** Core hub scripts needed by React apps (settings sync) and legacy hosts. */
export const CORE_SCRIPTS = [
  'shared/storage.js',
  'shared/string-utils.js',
  'shared/hub-api-client.js',
] as const;

const loaded = new Set<string>();
let corePromise: Promise<void> | null = null;

/**
 * Directory that contains index.html / shared / apps (not the current SPA hash route).
 * Relative script URLs must not resolve against pathnames like /deck-builder/.
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

  // Fall back to origin root (Vite dev) rather than the current pathname.
  return `${window.location.origin}/`;
}

export function hubDocumentRoot(): string {
  const entry = document.querySelector<HTMLScriptElement>(
    'script[type="module"][src*="/assets/"], script[type="module"][src*="/src/hub/"]',
  );
  return hubDocumentRootFromEntry(entry?.src);
}

function scriptUrl(src: string): string {
  return new URL(src, hubDocumentRoot()).href;
}

/** Resolve a hub static script against an explicit entry URL (for tests). */
export function scriptUrlFromEntry(src: string, entrySrc: string): string {
  return new URL(src, hubDocumentRootFromEntry(entrySrc)).href;
}

function loadScript(src: string): Promise<void> {
  if (loaded.has(src)) return Promise.resolve();

  // A prior failed attempt leaves a dead tag; remove and retry.
  document.querySelector(`script[data-hub-legacy="${src}"]`)?.remove();

  return new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = scriptUrl(src);
    el.async = false;
    el.dataset.hubLegacy = src;
    el.onload = () => {
      loaded.add(src);
      resolve();
    };
    el.onerror = () => {
      el.remove();
      reject(new Error(`Failed to load ${src}`));
    };
    document.body.appendChild(el);
  });
}

export async function ensureCoreScripts(): Promise<void> {
  if (corePromise) return corePromise;
  corePromise = (async () => {
    for (const src of CORE_SCRIPTS) {
      await loadScript(src);
    }
  })();
  try {
    await corePromise;
  } catch (err) {
    corePromise = null;
    throw err;
  }
}

export { loadScript, loaded as loadedScripts, scriptUrl };
