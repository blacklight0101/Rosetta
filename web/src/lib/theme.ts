// design-system.md section 2: the theme follows the operating system (`prefers-color-scheme`);
// a toggle in the header overrides it per browser and the choice is kept in localStorage, which
// may be unavailable (private window, blocked site data), so every access is guarded.

export type ThemePreference = 'system' | 'light' | 'dark';
export type Theme = 'light' | 'dark';

export interface ThemeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const storageKey = 'rosetta.theme';
const order: readonly ThemePreference[] = ['system', 'light', 'dark'];

const isPreference = (value: string | null): value is ThemePreference =>
  value === 'system' || value === 'light' || value === 'dark';

// RNF-010
export function resolveTheme(preference: ThemePreference, prefersDark: boolean): Theme {
  if (preference === 'system') return prefersDark ? 'dark' : 'light';
  return preference;
}

// RNF-010
export function nextThemePreference(preference: ThemePreference): ThemePreference {
  return order[(order.indexOf(preference) + 1) % order.length] ?? 'system';
}

// RNF-010
export function loadThemePreference(storage: ThemeStorage): ThemePreference {
  try {
    const stored = storage.getItem(storageKey);
    return isPreference(stored) ? stored : 'system';
  } catch {
    return 'system';
  }
}

// RNF-010
export function saveThemePreference(storage: ThemeStorage, preference: ThemePreference): void {
  try {
    storage.setItem(storageKey, preference);
  } catch {
    // The choice then lasts for this page view only.
  }
}
