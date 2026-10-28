import { createContext, useCallback, useContext, useEffect, useState } from 'react';

export type Theme = 'dark' | 'light';

/** localStorage key; index.html reads the same key before first paint. */
export const THEME_STORAGE_KEY = 'vehicle-analyzer.theme';

function readStored(): Theme | null {
  try {
    const t = window.localStorage.getItem(THEME_STORAGE_KEY);
    return t === 'light' || t === 'dark' ? t : null;
  } catch {
    return null;
  }
}

function systemTheme(): Theme {
  try {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

/** Theme on first load: the stored choice, else the system preference, else dark. */
export function initialTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  return readStored() ?? systemTheme();
}

/**
 * Current theme, applied as `data-theme` on <html>. Toggling stores the choice; until
 * the user toggles once, the system preference is followed.
 */
export function useTheme(): { theme: Theme; setTheme: (t: Theme) => void; toggleTheme: () => void } {
  const [theme, setThemeState] = useState<Theme>(initialTheme);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Follow the system preference only while the user has not chosen explicitly.
  useEffect(() => {
    let mq: MediaQueryList;
    try {
      mq = window.matchMedia('(prefers-color-scheme: light)');
    } catch {
      return;
    }
    const onChange = () => {
      if (readStored() === null) setThemeState(mq.matches ? 'light' : 'dark');
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, t);
    } catch {
      // storage blocked (private window etc.): the choice lasts for this session only
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next: Theme = prev === 'dark' ? 'light' : 'dark';
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, next);
      } catch {
        // see setTheme
      }
      return next;
    });
  }, []);

  return { theme, setTheme, toggleTheme };
}

/**
 * Read a theme token as a CSS colour string, for canvas drawing (the oscilloscope).
 * Re-read after a theme change; `alpha` is 0..1.
 */
export function themeColor(token: TermToken, alpha = 1): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(`--t-${token}`).trim();
  return alpha >= 1 ? `rgb(${raw})` : `rgb(${raw} / ${alpha})`;
}

export type TermToken =
  | 'bg'
  | 'raise'
  | 'row'
  | 'rule'
  | 'rule-hi'
  | 'fg'
  | 'hi'
  | 'dim'
  | 'faint'
  | 'amber'
  | 'amber-bg'
  | 'red'
  | 'red-bg';

/** Active theme for components that draw with canvas and must redraw on a switch. */
export const ThemeContext = createContext<Theme>('dark');

/** The active theme (provided by App); use it as a dependency to re-read `themeColor`. */
export function useActiveTheme(): Theme {
  return useContext(ThemeContext);
}
