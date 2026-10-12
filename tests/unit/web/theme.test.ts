import { describe, expect, it } from 'vitest';
import {
  loadThemePreference,
  nextThemePreference,
  resolveTheme,
  saveThemePreference,
  type ThemeStorage,
} from '../../../web/src/lib/theme';

// design-system.md section 2: themes follow the operating system unless the header toggle
// overrides them per browser (kept in localStorage, which may be unavailable).

const memoryStorage = (initial: Record<string, string> = {}): ThemeStorage => {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
  };
};
const brokenStorage: ThemeStorage = {
  getItem: () => {
    throw new Error('blocked');
  },
  setItem: () => {
    throw new Error('blocked');
  },
};

describe('RNF-010 theme', () => {
  it('RNF-010 follows the operating system when nothing is chosen', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });

  it('RNF-010 uses the chosen theme whatever the operating system prefers', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('RNF-010 cycles system, light, dark', () => {
    expect(nextThemePreference('system')).toBe('light');
    expect(nextThemePreference('light')).toBe('dark');
    expect(nextThemePreference('dark')).toBe('system');
  });

  it('RNF-010 keeps the choice in storage and ignores an unknown stored value', () => {
    const storage = memoryStorage();
    saveThemePreference(storage, 'dark');
    expect(loadThemePreference(storage)).toBe('dark');
    expect(loadThemePreference(memoryStorage({ 'rosetta.theme': 'purple' }))).toBe('system');
  });

  it('RNF-010 works without storage', () => {
    expect(loadThemePreference(brokenStorage)).toBe('system');
    expect(() => {
      saveThemePreference(brokenStorage, 'light');
    }).not.toThrow();
  });
});
