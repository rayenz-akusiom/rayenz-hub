import { useEffect, useMemo, useState } from 'react';
import {
  extrasCardView,
  resolveExtrasDisplayCards,
  type CardInstance,
  type CardView,
} from '@rayenz-hub/shared';

function sourceScryfallIds(cards: readonly Pick<CardInstance, 'scryfallId'>[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const card of cards) {
    const id = String(card.scryfallId || '').trim();
    if (!id) continue;
    const key = id.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(id);
  }
  return out;
}

function sourceSignature(ids: readonly string[]): string {
  return [...ids].map((id) => id.toLowerCase()).sort().join(',');
}

/**
 * Resolve display-only extras (tokens / emblems / dungeons) for the given source cards.
 * Returns [] while loading or when empty — callers should hide the section.
 */
export function useDeckExtras(
  sourceCards: readonly Pick<CardInstance, 'scryfallId'>[] | null | undefined,
  enabled = true,
): CardView[] {
  const ids = useMemo(
    () => (enabled ? sourceScryfallIds(sourceCards || []) : []),
    [sourceCards, enabled],
  );
  const signature = useMemo(() => sourceSignature(ids), [ids]);
  const [extras, setExtras] = useState<CardView[]>([]);

  useEffect(() => {
    if (!enabled || !ids.length) {
      setExtras([]);
      return;
    }
    const ac = new AbortController();
    let cancelled = false;
    void (async () => {
      try {
        const display = await resolveExtrasDisplayCards(ids, { signal: ac.signal });
        if (cancelled || ac.signal.aborted) return;
        setExtras(display.map(extrasCardView));
      } catch {
        if (cancelled || ac.signal.aborted) return;
        setExtras([]);
      }
    })();
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [enabled, signature, ids]);

  return extras;
}
