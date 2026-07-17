import { useEffect, useRef, useState } from 'react';
import { ensureLegacyScripts, getLegacyLoader } from '../hub/legacy-scripts';
import { installHubCardPickerBridge } from '../cards/CardPicker';

/**
 * React route host for a vanilla MTG app. Scripts load once; CardPicker is the
 * shared React bridge (not shared/card-picker.js).
 */
export function VanillaMtgApp({ path, title }: { path: string; title: string }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const root = rootRef.current;
    if (!root) return;

    setLoading(true);
    setError(null);
    root.innerHTML = '';

    (async () => {
      try {
        await ensureLegacyScripts();
        installHubCardPickerBridge();
        if (cancelled) return;
        const loader = getLegacyLoader(path);
        if (!loader) throw new Error(`No loader for ${path}`);
        await loader(root);
        if (!cancelled) setLoading(false);
      } catch (err) {
        if (cancelled) return;
        console.error(err);
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      root.innerHTML = '';
    };
  }, [path]);

  return (
    <div className="hub-mtg-host" data-mtg-app={path} aria-label={title}>
      {loading ? <div className="hub-loading">Loading…</div> : null}
      {error ? <div className="hub-error">Failed to load {title}: {error}</div> : null}
      <div ref={rootRef} hidden={loading || !!error} />
    </div>
  );
}
