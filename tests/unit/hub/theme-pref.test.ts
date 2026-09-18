import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  THEME_STORAGE_KEY,
  applyTheme,
  isHubTheme,
  loadTheme,
  saveTheme,
  toggleTheme,
} from '../../../packages/web/src/hub/theme-pref';

describe('theme-pref', () => {
  beforeEach(() => {
    localStorage.removeItem(THEME_STORAGE_KEY);
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.style.colorScheme = '';
  });

  afterEach(() => {
    localStorage.removeItem(THEME_STORAGE_KEY);
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.style.colorScheme = '';
  });

  it('defaults to light when storage is empty or invalid', () => {
    expect(loadTheme()).toBe('light');
    localStorage.setItem(THEME_STORAGE_KEY, 'neon');
    expect(loadTheme()).toBe('light');
  });

  it('loads a saved theme', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    expect(loadTheme()).toBe('dark');
  });

  it('applyTheme sets data-theme and color-scheme', () => {
    applyTheme('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
    applyTheme('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.documentElement.style.colorScheme).toBe('light');
  });

  it('saveTheme persists and applies', () => {
    saveTheme('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('toggleTheme flips light and dark', () => {
    expect(toggleTheme('light')).toBe('dark');
    expect(loadTheme()).toBe('dark');
    expect(toggleTheme('dark')).toBe('light');
    expect(loadTheme()).toBe('light');
  });

  it('isHubTheme narrows values', () => {
    expect(isHubTheme('light')).toBe(true);
    expect(isHubTheme('dark')).toBe(true);
    expect(isHubTheme('system')).toBe(false);
    expect(isHubTheme(null)).toBe(false);
  });
});
