import { afterEach, expect, it, vi } from 'vitest';
import {
  forgetProject,
  rememberedProject,
  rememberProject,
} from '../../../web/src/app/remembered-project.js';

// P1-175: the last project the user opened is kept for this browser session only (sessionStorage),
// so the side navigation can keep linking to it from pages outside a project.

afterEach(() => {
  vi.restoreAllMocks();
  window.sessionStorage.clear();
});

it('P1-175 remembers the project id for the browser session and forgets it', () => {
  expect(rememberedProject()).toBeUndefined();

  rememberProject('p-7');
  expect(rememberedProject()).toBe('p-7');

  forgetProject();
  expect(rememberedProject()).toBeUndefined();
});

it('P1-175 keeps nothing in localStorage, which outlives the session', () => {
  rememberProject('p-7');

  expect(window.localStorage.length).toBe(0);
});

it('P1-175 works without storage: nothing is remembered and nothing throws', () => {
  vi.spyOn(window, 'sessionStorage', 'get').mockImplementation(() => {
    throw new Error('blocked');
  });

  expect(() => {
    rememberProject('p-7');
    forgetProject();
  }).not.toThrow();
  expect(rememberedProject()).toBeUndefined();
});
