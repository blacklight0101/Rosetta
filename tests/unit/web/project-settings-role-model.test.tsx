import { act, fireEvent, screen, waitFor } from '@testing-library/preact';
import { expect, it } from 'vitest';
import { ProjectSettingsPage } from '../../../web/src/pages/ProjectSettingsPage.js';
import { json, renderPage, type Answer } from './fake-api.js';
import { projectOf, templateSettings } from './project-fixtures.js';

// RF-436, RF-405, P8-72: choosing a provider for a role selects the first model of the provider's
// shipped list that the role can use, marks it "(recommended)", and never leaves "Choose a model".

const route = '/api/projects/p-1';
const settingsRoute = `${route}/settings`;
const demo = projectOf('p-1', 'octo/demo');

const anthropic = json(200, {
  provider: 'anthropic',
  models: [
    { model: 'claude-opus-5-5', label: 'Claude Opus 5.5', priced: true },
    { model: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', priced: true },
  ],
});
const openai = json(200, {
  provider: 'openai',
  models: [
    { model: 'gpt-no-tools', label: 'GPT no tools', priced: true, noTools: true },
    { model: 'gpt-5-nano', label: 'GPT-5 nano', priced: true },
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
      'GET /api/models/anthropic': anthropic,
      'GET /api/models/openai': openai,
      [`PUT ${settingsRoute}`]: json(200, demo),
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
const toProvider = (role: string, provider: string): void => {
  fireEvent.change(screen.getByLabelText(`${role} provider`), { target: { value: provider } });
};

/** A model list that stays unanswered until `release` is called. */
function held(answer: Response): { readonly answer: Answer; readonly release: () => void } {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { answer: () => gate.then(() => answer.clone()), release };
}

it('RF-436 choosing Anthropic for a role selects its first listed model, never "Choose a model"', async () => {
  const { calls } = renderSettings();
  await loaded();
  await waitFor(() => selectOf('Planner model'));

  toProvider('Planner', 'anthropic');

  await waitFor(() => {
    expect(selectOf('Planner model').value).toBe('claude-opus-5-5');
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));
  await screen.findByText('Settings saved.');
  expect(calls.findLast((call) => call.method === 'PUT')?.body).toMatchObject({
    roles: {
      reader: { provider: 'ollama', model: 'gemma4:e4b' },
      planner: { provider: 'anthropic', model: 'claude-opus-5-5' },
    },
  });
});

it('RF-436 the model that the provider choice picked is marked recommended in the dropdown', async () => {
  renderSettings();
  await loaded();
  await waitFor(() => selectOf('Planner model'));

  toProvider('Planner', 'anthropic');

  await waitFor(() => {
    expect(optionTexts(selectOf('Planner model'))).toEqual([
      'Choose a model',
      'Claude Opus 5.5 (recommended)',
      'Claude Haiku 5.5',
      'Other model...',
    ]);
  });
});

it('RF-436 the Roles section says that choosing a provider selects its recommended model', async () => {
  renderSettings();
  await loaded();

  expect(
    screen.getByText(
      /Choosing a provider selects its recommended model; change it if you want another\./u,
    ),
  ).toBeTruthy();
});

it('RF-436 a model chosen after the provider is kept', async () => {
  const { calls } = renderSettings();
  await loaded();
  await waitFor(() => selectOf('Planner model'));

  toProvider('Planner', 'anthropic');
  await waitFor(() => {
    expect(selectOf('Planner model').value).toBe('claude-opus-5-5');
  });
  fireEvent.change(selectOf('Planner model'), { target: { value: 'claude-haiku-5-5' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));

  await screen.findByText('Settings saved.');
  expect(calls.findLast((call) => call.method === 'PUT')?.body).toMatchObject({
    roles: { planner: { provider: 'anthropic', model: 'claude-haiku-5-5' } },
  });
});

it('RF-436 the reader takes the first listed model that can call tools; the other roles take the first', async () => {
  renderSettings();
  await loaded();
  await waitFor(() => selectOf('Reader model'));

  toProvider('Reader', 'openai');
  toProvider('Verifier', 'openai');

  await waitFor(() => {
    expect(selectOf('Reader model').value).toBe('gpt-5-nano');
    expect(selectOf('Verifier model').value).toBe('gpt-no-tools');
  });
  expect(optionTexts(selectOf('Reader model'))).toContain('GPT-5 nano (recommended)');
  expect(optionTexts(selectOf('Verifier model'))).toContain('GPT no tools (recommended)');
});

it('RF-436 a list that arrives after the provider was chosen sets the model when it arrives', async () => {
  const slow = held(anthropic);
  renderSettings({ 'GET /api/models/anthropic': slow.answer });
  await loaded();
  await waitFor(() => selectOf('Planner model'));

  toProvider('Planner', 'anthropic');
  slow.release();

  await waitFor(() => {
    expect(selectOf('Planner model').value).toBe('claude-opus-5-5');
  });
});

it('RF-436 a model typed before the list arrives is not replaced by the recommended one', async () => {
  const slow = held(anthropic);
  const { calls } = renderSettings({ 'GET /api/models/anthropic': slow.answer });
  await loaded();
  await waitFor(() => selectOf('Planner model'));

  toProvider('Planner', 'anthropic');
  fireEvent.input(screen.getByLabelText('Planner model'), { target: { value: 'claude-typed' } });
  slow.release();

  // The list is on the page once its recommended option shows; the role's wait ends in the effect
  // of that render, so what is asserted after it is what the effect left.
  await waitFor(() => {
    expect(optionTexts(selectOf('Planner model'))).toContain('Claude Opus 5.5 (recommended)');
  });
  await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
  expect(selectOf('Planner model').value).toBe('__other__');
  expect(screen.getByLabelText<HTMLInputElement>('Planner other model').value).toBe('claude-typed');
  fireEvent.click(screen.getByRole('button', { name: 'Save settings' }));

  await screen.findByText('Settings saved.');
  expect(calls.findLast((call) => call.method === 'PUT')?.body).toMatchObject({
    roles: { planner: { provider: 'anthropic', model: 'claude-typed' } },
  });
});

it('RF-436 a list that cannot be loaded leaves the empty text field', async () => {
  renderSettings({ 'GET /api/models/anthropic': json(500, { code: 'RST-1000' }) });
  await loaded();
  await waitFor(() => selectOf('Planner model'));

  toProvider('Planner', 'anthropic');

  await screen.findAllByText('The list of models could not be loaded. Type the model id.');
  expect(screen.getByLabelText<HTMLInputElement>('Planner model').value).toBe('');
});

it('RF-436 a provider with no shipped list keeps the model empty and marks nothing recommended', async () => {
  renderSettings();
  await loaded();
  await waitFor(() => selectOf('Planner model'));

  toProvider('Planner', 'openai-compatible');
  await waitFor(() => {
    expect(screen.getByLabelText<HTMLInputElement>('Planner model').value).toBe('');
  });
  toProvider('Planner', 'openai');
  await waitFor(() => {
    expect(selectOf('Planner model').value).toBe('gpt-no-tools');
  });
  toProvider('Planner', 'ollama');

  await waitFor(() => {
    expect(optionTexts(selectOf('Planner model'))).toEqual([
      'Choose a model',
      'gemma4:e4b',
      'qwen3:8b',
      'Other model...',
    ]);
  });
  expect(selectOf('Planner model').value).toBe('');
});

it('RF-436 a project opened with saved models shows them unchanged', async () => {
  const saved = projectOf('p-1', 'octo/demo', {
    settings: {
      ...templateSettings(),
      providers: {
        ...templateSettings().providers,
        anthropic: {
          kind: 'anthropic',
          keySource: 'user-then-server',
          toolMode: 'native',
          timeoutSeconds: 120,
          maxRetries: 3,
        },
      },
      roles: {
        ...templateSettings().roles,
        planner: {
          ...templateSettings().roles.planner,
          provider: 'anthropic',
          model: 'claude-haiku-5-5',
        },
      },
    },
  });
  renderSettings({ [`GET ${route}`]: json(200, saved) });
  await loaded();

  await waitFor(() => {
    expect(selectOf('Planner model').value).toBe('claude-haiku-5-5');
  });
});
