import { fireEvent, screen } from '@testing-library/preact';
import { expect, it } from 'vitest';
import { ProjectSettingsPage } from '../../../web/src/pages/ProjectSettingsPage.js';
import { json, renderPage } from './fake-api.js';
import { projectOf, templateSettings } from './project-fixtures.js';

// Q-57, RF-002, RF-405: a role whose output limit the project never set shows an empty field that
// says so, saving leaves it out (so the role keeps the default of its model, whatever provider it
// is changed to), and a number typed into it is stored.

const route = '/api/projects/p-1';
const settingsRoute = `${route}/settings`;

function withoutReaderLimit(): Record<string, unknown> {
  const settings = templateSettings();
  const { provider, model, maxTurns } = settings.roles.reader;
  const reader = { provider, model, maxTurns };
  return projectOf('p-1', 'octo/demo', {
    settings: { ...settings, roles: { ...settings.roles, reader } },
  });
}

const renderSettings = (project: Record<string, unknown>) =>
  renderPage(
    <ProjectSettingsPage />,
    { [`GET ${route}`]: json(200, project), [`PUT ${settingsRoute}`]: json(200, project) },
    undefined,
    { projectId: 'p-1' },
  );

const loaded = () => screen.findByRole('heading', { name: 'Project settings' });

function inputOf(label: string): HTMLInputElement {
  const field = screen.getByLabelText(label);
  if (!(field instanceof HTMLInputElement)) throw new Error(`${label} is not an input.`);
  return field;
}

it('Q-57 shows an empty field and says the role uses the default of its model', async () => {
  renderSettings(withoutReaderLimit());
  await loaded();

  expect(inputOf('Reader max output tokens').value).toBe('');
  expect(screen.getAllByText(/Not set: the role uses the default of its model/u)).toHaveLength(1);
  expect(inputOf('Verifier max output tokens').value).toBe('2048');
});

it('Q-57 saving leaves the output limit of that role out of the document', async () => {
  const { calls } = renderSettings(withoutReaderLimit());
  await loaded();

  fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));

  await screen.findByText('Settings saved.');
  const body = calls.findLast((call) => call.method === 'PUT')?.body;
  expect(body).toMatchObject({ roles: { verifier: { maxOutputTokens: 2048 } } });
  expect(JSON.stringify(body)).not.toMatch(/"reader":\{[^}]*maxOutputTokens/u);
});

it('Q-57 a number typed into the empty field is stored, and emptying a set field unsets it', async () => {
  const { calls } = renderSettings(withoutReaderLimit());
  await loaded();

  fireEvent.input(inputOf('Reader max output tokens'), { target: { value: '8000' } });
  fireEvent.input(inputOf('Verifier max output tokens'), { target: { value: '' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));

  await screen.findByText('Settings saved.');
  const body = calls.findLast((call) => call.method === 'PUT')?.body;
  expect(body).toMatchObject({ roles: { reader: { maxOutputTokens: 8000 } } });
  expect(JSON.stringify(body)).not.toMatch(/"verifier":\{[^}]*maxOutputTokens/u);
});
