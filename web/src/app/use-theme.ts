import { useEffect, useState } from 'preact/hooks';
import {
  loadThemePreference,
  resolveTheme,
  saveThemePreference,
  type ThemePreference,
  type ThemeStorage,
} from '../lib/theme.js';

// design-system.md section 2: sets `data-theme` on the root element from the operating system or
// the saved choice, and follows the operating system while no choice is saved. The storage is read
// lazily because merely touching localStorage can throw when site data is blocked.

const browserStorage: ThemeStorage = {
  getItem: (key) => window.localStorage.getItem(key),
  setItem: (key, value) => {
    window.localStorage.setItem(key, value);
  },
};
const darkQuery = '(prefers-color-scheme: dark)';

// RNF-010
export function useTheme(): readonly [ThemePreference, (next: ThemePreference) => void] {
  const [preference, setPreference] = useState(() => loadThemePreference(browserStorage));
  useEffect(() => {
    const query = window.matchMedia(darkQuery);
    const apply = (): void => {
      document.documentElement.dataset['theme'] = resolveTheme(preference, query.matches);
    };
    apply();
    query.addEventListener('change', apply);
    return () => {
      query.removeEventListener('change', apply);
    };
  }, [preference]);
  const choose = (next: ThemePreference): void => {
    saveThemePreference(browserStorage, next);
    setPreference(next);
  };
  return [preference, choose];
}
