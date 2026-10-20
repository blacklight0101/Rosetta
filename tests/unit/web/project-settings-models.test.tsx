import { fireEvent, screen, waitFor } from '@testing-library/preact';
import { expect, it } from 'vitest';
import { ProjectSettingsPage } from '../../../web/src/pages/ProjectSettingsPage.js';
import { json, renderPage, type Answer } from './fake-api.js';
import { projectOf, templateSettings } from './project-fixtures.js';

// RF-405, RF-427, DEC-156: the model of each role in a project's settings is chosen from the list
// of its provider, with "Other model..." for free text; a saved model that is not listed stays
// selected there; Ollama lists what is installed and falls back to the text field.

const route = '/api/projects/p-1';
const settingsRoute = `${route}/settings`;
const demo = projectOf('p-1', 'octo/demo');

const openai = json(200, {
  provider: 'openai',
  models: [
    { model: 'gpt-5-nano', label: 'GPT-5 nano', priced: true },
    { model: 'gpt-5-future', label: 'GPT-5 future', priced: false },
  ],
});
const installed = json(200, {
  provider: 'ollama',
  models: [
    { model: 'gemma4:e4b', label: 'gemma4:e4b', priced: true },
    { model: 'qwen3:8b', label: 'qwen3:8b', priced: true },
  ],
});

const renderSettings = (answers: Readonly<Record<string, Answer>> = {}) =>
  renderPage(
    <ProjectSettingsPage />,
    {
      [`GET ${route}`]: json(200, demo),
      'GET /api/models/ollama': installed,
      'GET /api/models/openai': openai,
      ...answers,
    },
    undefined,
    { projectId: 'p-1' },
  );

function selectOf(label: string): HTMLSelectElement {
  const field = screen.getByLabelText(label);
  if (!(field instanceof HTMLSelectElement)) throw new Error(`${label} is not a select.`);
  return field;
}

const optionTexts = (select: HTMLSelectElement): string[] =>
  Array.from(select.options).map((option) => option.textContent);

const loaded = () => screen.findByRole('heading', { name: 'Project settings' });
const save = (): void => {
  fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
};

it('RF-405 the installed Ollama models are the options of a role on Ollama, the saved one selected', async () => {
  renderSettings();
  await loaded();

  const select = await waitFor(() => selectOf('Reader model'));

  expect(optionTexts(select)).toEqual([
    'Choose a model',
    'gemma4:e4b',
    'qwen3:8b',
    'Other model...',
  ]);
  expect(select.value).toBe('gemma4:e4b');
});

it('RF-405 choosing another installed model saves it', async () => {
  const { calls } = renderSettings({ [`PUT ${settingsRoute}`]: json(200, demo) });
  await loaded();

  fireEvent.change(await waitFor(() => selectOf('Reader model')), {
    target: { value: 'qwen3:8b' },
  });
  save();

  await screen.findByText('Settings saved.');
  expect(calls.findLast((call) => call.method === 'PUT')?.body).toMatchObject({
    roles: { reader: { provider: 'ollama', model: 'qwen3:8b' } },
  });
});

it('RF-405 a saved model that is not installed stays selected under Other model...', async () => {
  const saved = projectOf('p-1', 'octo/demo', {
    settings: {
      ...templateSettings(),
      roles: {
        ...templateSettings().roles,
        reader: { ...templateSettings().roles.reader, model: 'phi4:14b' },
      },
    },
  });
  renderSettings({ [`GET ${route}`]: json(200, saved) });
  await loaded();

  await waitFor(() => {
    expect(selectOf('Reader model').value).toBe('__other__');
  });
  expect(screen.getByLabelText<HTMLInputElement>('Reader other model').value).toBe('phi4:14b');
});

it('RF-405 changing the provider of a role resets its model and lists the new provider', async () => {
  const { calls } = renderSettings({ [`PUT ${settingsRoute}`]: json(200, demo) });
  await loaded();
  await waitFor(() => selectOf('Planner model'));

  fireEvent.change(screen.getByLabelText('Planner provider'), { target: { value: 'openai' } });
  const select = await waitFor(() => {
    const found = selectOf('Planner model');
    expect(optionTexts(found)).toContain('GPT-5 future (no price)');
    return found;
  });
  expect(select.value).toBe('');
  fireEvent.change(select, { target: { value: 'gpt-5-nano' } });
  save();

  await screen.findByText('Settings saved.');
  expect(calls.findLast((call) => call.method === 'PUT')?.body).toMatchObject({
    roles: { planner: { provider: 'openai', model: 'gpt-5-nano' } },
  });
});

it('RF-405 Other model... saves free text for a role', async () => {
  const { calls } = renderSettings({ [`PUT ${settingsRoute}`]: json(200, demo) });
  await loaded();

  fireEvent.change(await waitFor(() => selectOf('Verifier model')), {
    target: { value: '__other__' },
  });
  fireEvent.input(screen.getByLabelText('Verifier other model'), {
    target: { value: 'phi4:14b' },
  });
  save();

  await screen.findByText('Settings saved.');
  expect(calls.findLast((call) => call.method === 'PUT')?.body).toMatchObject({
    roles: { verifier: { provider: 'ollama', model: 'phi4:14b' } },
  });
});

it('RF-405 Ollama down: the text field and a note stay, and saving works', async () => {
  const { calls } = renderSettings({
    'GET /api/models/ollama': json(200, {
      provider: 'ollama',
      models: [],
      reason: 'Ollama did not answer in time.',
    }),
    [`PUT ${settingsRoute}`]: json(200, demo),
  });
  await loaded();

  await screen.findAllByText(/Ollama did not answer in time\. Type the model id/u);
  fireEvent.input(screen.getByLabelText('Reader model'), { target: { value: 'gemma4:e2b' } });
  save();

  await screen.findByText('Settings saved.');
  expect(calls.findLast((call) => call.method === 'PUT')?.body).toMatchObject({
    roles: { reader: { provider: 'ollama', model: 'gemma4:e2b' } },
  });
});

it('RF-405 Ollama is asked once for the four roles', async () => {
  const { calls } = renderSettings();
  await loaded();
  await waitFor(() => selectOf('Summariser model'));

  expect(calls.filter((call) => call.path === '/api/models/ollama')).toHaveLength(1);
});

it('RF-405 a price override keeps its plain model text field', async () => {
  renderSettings();
  await loaded();

  fireEvent.click(screen.getByRole('button', { name: 'Add price override' }));

  expect(screen.getByLabelText('Override 1 model').tagName).toBe('INPUT');
});
