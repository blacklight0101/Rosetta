import { fireEvent, screen } from '@testing-library/preact';
import { expect, it } from 'vitest';
import { ProjectSettingsPage } from '../../../web/src/pages/ProjectSettingsPage.js';
import { failure, json, renderPage, type Answer } from './fake-api.js';
import { projectOf } from './project-fixtures.js';

// RF-002 (P1-106): the settings page saves from the version it loaded (If-Match), takes the version
// a save answers for the next one, and says so, with the code, when the server refuses a save made
// from an older version (two tabs, or a cap edit on the start page and a settings save).

const route = '/api/projects/p-1';
const settingsRoute = `${route}/settings`;

const versioned = (version: number) => projectOf('p-1', 'octo/demo', { settingsVersion: version });

const renderSettings = (version: number, answers: Readonly<Record<string, Answer>>) =>
  renderPage(
    <ProjectSettingsPage />,
    { [`GET ${route}`]: json(200, versioned(version)), ...answers },
    undefined,
    { projectId: 'p-1' },
  );

const save = (): void => {
  fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
};

const loaded = () => screen.findByRole('heading', { name: 'Project settings' });

it('RF-002 a save names the version the page loaded in If-Match', async () => {
  const { calls } = renderSettings(4, { [`PUT ${settingsRoute}`]: json(200, versioned(5)) });
  await loaded();

  save();

  await screen.findByText('Settings saved.');
  expect(calls.findLast((call) => call.method === 'PUT')).toMatchObject({
    method: 'PUT',
    ifMatch: '"4"',
  });
});

it('RF-002 the next save names the version the last save answered', async () => {
  const { calls } = renderSettings(4, { [`PUT ${settingsRoute}`]: json(200, versioned(5)) });
  await loaded();
  save();
  await screen.findByText('Settings saved.');

  fireEvent.input(screen.getByLabelText('Reader model'), { target: { value: 'gemma4:e2b' } });
  save();

  await screen.findByText('Settings saved.');
  const puts = calls.filter((call) => call.method === 'PUT');
  expect(puts.map((call) => call.ifMatch)).toEqual(['"4"', '"5"']);
});

it('RF-002 a save made from an older version shows RST-1007 and is not reported as saved', async () => {
  renderSettings(4, { [`PUT ${settingsRoute}`]: failure(409, 'RST-1007') });
  await loaded();

  save();

  const alert = await screen.findByRole('alert');
  expect(alert.textContent).toContain('RST-1007');
  expect(screen.queryByText('Settings saved.')).toBeNull();
});
