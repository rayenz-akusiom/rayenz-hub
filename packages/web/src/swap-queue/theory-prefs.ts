import { useEffect, useState } from 'react';

export const THEORY_DECK_IDS_STORAGE_KEY = 'rayenzHubSwapQueueTheoryDeckIds';

export function loadSelectedTheoryDeckIds(): string[] {
  try {
    const raw = localStorage.getItem(THEORY_DECK_IDS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === 'string' && id.trim().length > 0);
  } catch {
    return [];
  }
}

export function saveSelectedTheoryDeckIds(ids: string[]): void {
  try {
    localStorage.setItem(THEORY_DECK_IDS_STORAGE_KEY, JSON.stringify(ids));
  } catch {
    /* ignore */
  }
}

/** Progressive Swap Queue toolbar overflow (actions first, core controls last). */
export const SQ_ACTIONS_OVERFLOW_MQ = '(max-width: 1100px)';
export const SQ_CORE_OVERFLOW_MQ = '(max-width: 720px)';

export function useSqToolbarOverflow(): {
  actionsInMenu: boolean;
  coreInMenu: boolean;
} {
  const [actionsInMenu, setActionsInMenu] = useState(false);
  const [coreInMenu, setCoreInMenu] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const mqActions = window.matchMedia(SQ_ACTIONS_OVERFLOW_MQ);
    const mqCore = window.matchMedia(SQ_CORE_OVERFLOW_MQ);
    function sync() {
      const core = mqCore.matches;
      setCoreInMenu(core);
      setActionsInMenu(core || mqActions.matches);
    }
    sync();
    mqActions.addEventListener('change', sync);
    mqCore.addEventListener('change', sync);
    return () => {
      mqActions.removeEventListener('change', sync);
      mqCore.removeEventListener('change', sync);
    };
  }, []);

  return { actionsInMenu, coreInMenu };
}
