import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { providerDefaults } from '../../../web/src/pages/provider-choices.js';

// RF-002, P1-107: the providers a project does not define yet start, on the project settings page,
// with the values the settings template gives them. The page keeps its own copy, so this test keeps
// the two in step: a change to the template without the page (or the other way round) fails here.

// Vitest runs from the repository root.
const template: unknown = JSON.parse(
  await readFile(resolve(process.cwd(), 'templates/project-settings.json'), 'utf8'),
);

function providersOf(settings: unknown): unknown {
  if (typeof settings !== 'object' || settings === null || !('providers' in settings)) {
    throw new Error('The settings template has no providers.');
  }
  return settings.providers;
}

it('RF-002 the provider defaults of the settings page equal the providers of the settings template', () => {
  expect(providerDefaults).toEqual(providersOf(template));
});
