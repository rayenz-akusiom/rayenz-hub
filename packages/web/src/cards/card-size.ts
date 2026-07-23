import { useEffect, useState } from 'react';

/** Shared with vanilla Hub card-picker (`rayenzHubPickerCardSize`). */
export const CARD_SIZE_STORAGE_KEY = 'rayenzHubPickerCardSize';
export const CARD_SIZE_CHANGE_EVENT = 'rayenz-hub-card-size';

export type CardSizeKey = 'S' | 'M' | 'L';

/** M matches today's deck-builder `--db-card-w` (213px). */
export const CARD_SIZE_PX: Record<CardSizeKey, number> = {
  S: 150,
  M: 213,
  L: 310,
};

/** Builder aside swap-pair preview face width (legacy 0.42×S). Not a picker key. */
export const CARD_SIZE_SWAP_ASIDE_PX = Math.round(CARD_SIZE_PX.S * 0.42); // 63

/** Popout only when preview faces are below M; always renders at M. */
export function swapPairHoverPopoutWidthPx(previewWidthPx: number): number | null {
  return previewWidthPx < CARD_SIZE_PX.M ? CARD_SIZE_PX.M : null;
}

export const CARD_SIZE_LABELS: Record<CardSizeKey, string> = {
  S: 'Small',
  M: 'Medium',
  L: 'Large',
};

export const CARD_SIZE_GLYPHS: Record<CardSizeKey, number> = {
  S: 12,
  M: 16,
  L: 20,
};

export const CARD_SIZE_KEYS: CardSizeKey[] = ['S', 'M', 'L'];

export function loadCardSize(): CardSizeKey {
  try {
    const raw = localStorage.getItem(CARD_SIZE_STORAGE_KEY);
    if (raw === 'XL') return 'L';
    if (raw === 'S' || raw === 'M' || raw === 'L') return raw;
  } catch {
    /* ignore */
  }
  return 'M';
}

export function saveCardSize(size: CardSizeKey): void {
  try {
    localStorage.setItem(CARD_SIZE_STORAGE_KEY, size);
  } catch {
    /* ignore */
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(CARD_SIZE_CHANGE_EVENT, { detail: size }));
  }
}

export function useCardSize(): {
  size: CardSizeKey;
  setSize: (next: CardSizeKey) => void;
  widthPx: number;
} {
  const [size, setSizeState] = useState<CardSizeKey>(loadCardSize);

  useEffect(() => {
    function onChange(e: Event) {
      const detail = (e as CustomEvent).detail;
      if (detail === 'S' || detail === 'M' || detail === 'L') {
        setSizeState(detail);
        return;
      }
      setSizeState(loadCardSize());
    }
    function onStorage(e: StorageEvent) {
      if (e.key === CARD_SIZE_STORAGE_KEY) setSizeState(loadCardSize());
    }
    window.addEventListener(CARD_SIZE_CHANGE_EVENT, onChange);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(CARD_SIZE_CHANGE_EVENT, onChange);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  function setSize(next: CardSizeKey) {
    saveCardSize(next);
    setSizeState(next);
  }

  return { size, setSize, widthPx: CARD_SIZE_PX[size] };
}
