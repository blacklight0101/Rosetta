import { fireEvent, screen } from '@testing-library/preact';
import { expect, it } from 'vitest';
import { ProjectSettingsPage } from '../../../web/src/pages/ProjectSettingsPage.js';
import { json, renderPage } from './fake-api.js';
import { projectOf } from './project-fixtures.js';

// RF-433, DEC-197: the project settings page offers "No cap for local models", off by default.

const route = '/api/projects/p-1';
const settingsRoute = `${route}/settings`;
const demo = projectOf('p-1', 'octo/demo');

it('RF-433 "No cap for local models" is off by default and saves as on when ticked', async () => {
  const { calls } = renderPage(
    <ProjectSettingsPage />,
    { [`GET ${route}`]: json(200, demo), [`PUT ${settingsRoute}`]: json(200, demo) },
    undefined,
    { projectId: 'p-1' },
  );
  await screen.findByRole('heading', { name: 'Project settings' });
  const field = screen.getByLabelText('No cap for local models');
  if (!(field instanceof HTMLInputElement)) throw new Error('The setting is not an input.');
  expect(field.checked).toBe(false);

  fireEvent.click(field);
  fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));

  await screen.findByText('Settings saved.');
  expect(calls.findLast((call) => call.method === 'PUT')?.body).toMatchObject({
    budget: { noCapForLocalModels: true },
  });
});
