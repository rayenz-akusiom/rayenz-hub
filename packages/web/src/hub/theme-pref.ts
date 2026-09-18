import { useEffect, useState } from 'react';

export const THEME_STORAGE_KEY = 'rayenzHubTheme';
export const THEME_CHANGE_EVENT = 'rayenz-hub-theme';

export type HubTheme = 'light' | 'dark';

export function isHubTheme(value: unknown): value is HubTheme {
  return value === 'light' || value === 'dark';
}

export function loadTheme(): HubTheme {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (isHubTheme(raw)) return raw;
  } catch {
    /* ignore */
  }
  return 'light';
}

export function applyTheme(theme: HubTheme): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
}

export function saveTheme(theme: HubTheme): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* ignore */
  }
  applyTheme(theme);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(THEME_CHANGE_EVENT, { detail: theme }));
  }
}

export function toggleTheme(current: HubTheme = loadTheme()): HubTheme {
  const next: HubTheme = current === 'dark' ? 'light' : 'dark';
  saveTheme(next);
  return next;
}

export function useTheme(): {
  theme: HubTheme;
  setTheme: (next: HubTheme) => void;
  toggle: () => void;
} {
  const [theme, setThemeState] = useState<HubTheme>(loadTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    function onChange(e: Event) {
      const detail = (e as CustomEvent).detail;
      if (isHubTheme(detail)) {
        setThemeState(detail);
        return;
      }
      setThemeState(loadTheme());
    }
    function onStorage(e: StorageEvent) {
      if (e.key === THEME_STORAGE_KEY) setThemeState(loadTheme());
    }
    window.addEventListener(THEME_CHANGE_EVENT, onChange);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(THEME_CHANGE_EVENT, onChange);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  function setTheme(next: HubTheme) {
    saveTheme(next);
    setThemeState(next);
  }

  function toggle() {
    setThemeState(toggleTheme(theme));
  }

  return { theme, setTheme, toggle };
}
