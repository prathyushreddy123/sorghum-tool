import { useCallback, useEffect, useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark' | 'sun';

const STORAGE_KEY = 'fieldscout_theme';
const THEMES: Theme[] = ['light', 'dark', 'sun'];
const listeners = new Set<() => void>();

function getSnapshot(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && THEMES.includes(stored as Theme)) return stored as Theme;
  if (window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
  return 'light';
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.remove('dark', 'sun');
  if (theme !== 'light') root.classList.add(theme);
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, () => 'light' as Theme);

  useEffect(() => applyTheme(theme), [theme]);

  const setTheme = useCallback((next: Theme) => {
    localStorage.setItem(STORAGE_KEY, next);
    applyTheme(next);
    listeners.forEach(cb => cb());
  }, []);

  const cycleTheme = useCallback(() => {
    const idx = THEMES.indexOf(getSnapshot());
    const next = THEMES[(idx + 1) % THEMES.length];
    setTheme(next);
  }, [setTheme]);

  return { theme, setTheme, cycleTheme };
}
