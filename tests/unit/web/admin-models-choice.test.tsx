import { fireEvent, screen, waitFor } from '@testing-library/preact';
import { expect, it } from 'vitest';
import { AdminModelsPage } from '../../../web/src/pages/AdminModelsPage.js';
import { root } from './admin-fixtures.js';
import { renderPage } from './fake-api.js';
import {
  ollamaDown,
  optionTexts,
  ready,
  savedAs,
  selectOf,
  withRoles,
} from './model-list-fixtures.js';

// RF-405, RF-427, DEC-156: the Default models page chooses the model of each role from a dropdown
// of the provider's list, with "Other model..." for free text; Ollama lists what is installed, and
// falls back to the text field when it cannot be asked.

it('RF-405 an OpenAI role chooses its model from the listed models, one without a price marked', async () => {
  renderPage(
    <AdminModelsPage />,
    withRoles({ reader: { provider: 'openai', model: 'gpt-5-nano' } }),
    root,
  );
  await ready();

  const select = await waitFor(() => selectOf('Reader model'));

  expect(optionTexts(select)).toEqual([
    'Choose a model',
    'GPT-5 nano',
    'GPT-5 future (no price)',
    'Other model...',
  ]);
  expect(select.value).toBe('gpt-5-nano');
});

it('RF-405 an Anthropic role lists the Anthropic models and a chosen model is saved', async () => {
  const { calls } = renderPage(
    <AdminModelsPage />,
    {
      ...withRoles({}),
      'PUT /api/admin/default-roles': savedAs({
        planner: { provider: 'anthropic', model: 'claude-opus-5-5' },
      }),
    },
    root,
  );
  await ready();

  fireEvent.change(screen.getByLabelText('Planner provider'), { target: { value: 'anthropic' } });
  const select = await waitFor(() => selectOf('Planner model'));
  fireEvent.change(select, { target: { value: 'claude-opus-5-5' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save default models' }));

  await screen.findByText('Default models saved.');
  expect(calls.find((call) => call.method === 'PUT')?.body).toEqual({
    roles: { planner: { provider: 'anthropic', model: 'claude-opus-5-5' } },
  });
});

it('RF-405 Other model... saves the free text that is typed', async () => {
  const { calls } = renderPage(
    <AdminModelsPage />,
    {
      ...withRoles({ verifier: { provider: 'openai', model: 'gpt-5-nano' } }),
      'PUT /api/admin/default-roles': savedAs({
        verifier: { provider: 'openai', model: 'gpt-6-preview' },
      }),
    },
    root,
  );
  await ready();

  const select = await waitFor(() => selectOf('Verifier model'));
  fireEvent.change(select, { target: { value: '__other__' } });
  fireEvent.input(screen.getByLabelText('Verifier other model'), {
    target: { value: ' gpt-6-preview ' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save default models' }));

  await screen.findByText('Default models saved.');
  expect(calls.find((call) => call.method === 'PUT')?.body).toEqual({
    roles: { verifier: { provider: 'openai', model: 'gpt-6-preview' } },
  });
});

it('RF-405 a saved model that is not listed stays selected under Other model...', async () => {
  renderPage(
    <AdminModelsPage />,
    withRoles({ reader: { provider: 'openai', model: 'gpt-4o-mini-2024-07-18' } }),
    root,
  );
  await ready();

  await waitFor(() => {
    expect(selectOf('Reader model').value).toBe('__other__');
  });
  expect(screen.getByLabelText<HTMLInputElement>('Reader other model').value).toBe(
    'gpt-4o-mini-2024-07-18',
  );
});

it('RF-405 changing the provider resets the model, and a save without a model is refused at the select', async () => {
  const { calls } = renderPage(
    <AdminModelsPage />,
    withRoles({ reader: { provider: 'openai', model: 'gpt-5-nano' } }),
    root,
  );
  await ready();
  await waitFor(() => selectOf('Reader model'));

  fireEvent.change(screen.getByLabelText('Reader provider'), { target: { value: 'anthropic' } });
  const select = await waitFor(() => {
    const found = selectOf('Reader model');
    expect(optionTexts(found)).toContain('Claude Opus 5.5 (no price)');
    return found;
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save default models' }));

  expect(select.value).toBe('');
  expect((await screen.findByLabelText('Reader model')).getAttribute('aria-invalid')).toBe('true');
  expect(calls.some((call) => call.method === 'PUT')).toBe(false);
});

it('RF-405 changing the provider back to Template default clears the model and asks for none', async () => {
  const { calls } = renderPage(
    <AdminModelsPage />,
    {
      ...withRoles({ reader: { provider: 'openai', model: 'gpt-5-nano' } }),
      'PUT /api/admin/default-roles': savedAs({}),
    },
    root,
  );
  await ready();

  fireEvent.change(screen.getByLabelText('Reader provider'), { target: { value: '' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save default models' }));

  await screen.findByText('Default models saved.');
  expect(calls.find((call) => call.method === 'PUT')?.body).toEqual({ roles: {} });
});

it('RF-405 each provider in use is asked once, however many roles use it, and Template default asks nothing', async () => {
  const roles = {
    reader: { provider: 'openai', model: 'gpt-5-nano' },
    verifier: { provider: 'openai', model: 'gpt-5-nano' },
    planner: { provider: 'anthropic', model: 'claude-opus-5-5' },
  };
  const { calls } = renderPage(<AdminModelsPage />, withRoles(roles), root);
  await ready();
  await waitFor(() => selectOf('Planner model'));

  const asked = calls.filter((call) => call.path.startsWith('/api/models/')).map((c) => c.path);
  expect(asked.sort()).toEqual(['/api/models/anthropic', '/api/models/openai']);
});

it('RF-405 an Ollama role lists the installed models and Other model...', async () => {
  renderPage(
    <AdminModelsPage />,
    withRoles({ reader: { provider: 'ollama', model: 'gemma4:e4b' } }),
    root,
  );
  await ready();

  const select = await waitFor(() => selectOf('Reader model'));

  expect(optionTexts(select)).toEqual([
    'Choose a model',
    'gemma4:e4b',
    'qwen3:8b',
    'Other model...',
  ]);
  expect(select.value).toBe('gemma4:e4b');
});

it('RF-405 Ollama down: the text field and a note stay, and saving works', async () => {
  const { calls } = renderPage(
    <AdminModelsPage />,
    {
      ...withRoles({ reader: { provider: 'ollama', model: 'gemma4:e4b' } }),
      'GET /api/models/ollama': ollamaDown,
      'PUT /api/admin/default-roles': savedAs({
        reader: { provider: 'ollama', model: 'gemma4:e2b' },
      }),
    },
    root,
  );
  await ready();

  await screen.findByText(/Ollama could not be reached\. Type the model id/u);
  fireEvent.input(screen.getByLabelText('Reader model'), { target: { value: 'gemma4:e2b' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save default models' }));

  expect(screen.getByLabelText('Reader model').tagName).toBe('INPUT');
  await screen.findByText('Default models saved.');
  expect(calls.find((call) => call.method === 'PUT')?.body).toEqual({
    roles: { reader: { provider: 'ollama', model: 'gemma4:e2b' } },
  });
});

it('RF-405 a list that cannot be loaded leaves the text field with a note', async () => {
  const answers = withRoles({ reader: { provider: 'ollama', model: 'gemma4:e4b' } });
  const withoutList = Object.fromEntries(
    Object.entries(answers).filter(([key]) => key !== 'GET /api/models/ollama'),
  );
  renderPage(<AdminModelsPage />, withoutList, root);
  await ready();

  await screen.findByText(/could not be loaded/u);

  expect(screen.getByLabelText<HTMLInputElement>('Reader model').value).toBe('gemma4:e4b');
});
