import type { JSX } from 'preact';
import { nextThemePreference, type ThemePreference } from '../lib/theme.js';

// design-system.md section 2: the header toggle cycles system, light and dark; the choice is kept
// per browser by the caller.

export interface ThemeToggleProps {
  readonly theme: ThemePreference;
  readonly onTheme: (next: ThemePreference) => void;
}

const names: Readonly<Record<ThemePreference, string>> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
};

// RNF-010
export function ThemeToggle({ theme, onTheme }: ThemeToggleProps): JSX.Element {
  const next = nextThemePreference(theme);
  return (
    <button
      class="rst-button rst-button--ghost"
      type="button"
      data-testid="theme-toggle"
      aria-label={`Theme: ${names[theme]}. Switch to ${names[next]}.`}
      onClick={() => {
        onTheme(next);
      }}
    >
      {names[theme]}
    </button>
  );
}
