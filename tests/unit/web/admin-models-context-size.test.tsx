import { fireEvent, screen, waitFor } from '@testing-library/preact';
import { expect, it } from 'vitest';
import { AdminModelsPage } from '../../../web/src/pages/AdminModelsPage.js';
import { accountBody, cap, root } from './admin-fixtures.js';
import { failure, json, renderPage, type Answer } from './fake-api.js';

// RF-401, Q-23, Q-44: the Default models page offers the Ollama context size of new projects once a
// role uses Ollama; Auto leaves it out of the saved setting (the template keeps auto).

const withRoles = (saved: unknown): Readonly<Record<string, Answer>> => ({
  'GET /api/admin/users': json(200, { users: [accountBody('u-root', 'blacklight')] }),
  'GET /api/admin/caps': json(200, cap('500000', '1000000', '10000000')),
  'GET /api/admin/default-roles': json(200, { roles: saved }),
  'GET /api/models/ollama': json(200, { provider: 'ollama', models: [] }),
  'PUT /api/admin/default-roles': json(200, { roles: saved }),
});

const ollamaReader = { reader: { provider: 'ollama', model: 'gemma4:e4b' } };
const mode = () => screen.getByLabelText<HTMLSelectElement>('Ollama context size');
const size = () => screen.getByLabelText<HTMLInputElement>('Ollama context size in tokens');
const save = (): void => {
  fireEvent.click(screen.getByRole('button', { name: 'Save default models' }));
};

it('RF-401 Q-44 the field shows once a role uses Ollama, on Auto, and says it covers every Ollama role', async () => {
  renderPage(<AdminModelsPage />, withRoles(ollamaReader), root);

  await screen.findByLabelText('Reader provider');

  expect(mode().value).toBe('auto');
  expect(screen.getByText(/applies to every Ollama role of a new project/iu)).toBeTruthy();
});

it('RF-401 no role on Ollama means no field, and choosing Ollama brings it', async () => {
  renderPage(<AdminModelsPage />, withRoles({}), root);
  await screen.findByLabelText('Reader provider');
  expect(screen.queryByLabelText('Ollama context size')).toBeNull();

  fireEvent.change(screen.getByLabelText('Verifier provider'), { target: { value: 'ollama' } });

  expect(mode().value).toBe('auto');
});

it('RF-401 a size is saved with the roles as ollamaContextTokens', async () => {
  const { calls } = renderPage(<AdminModelsPage />, withRoles(ollamaReader), root);
  await screen.findByLabelText('Reader provider');

  fireEvent.change(mode(), { target: { value: 'number' } });
  fireEvent.input(size(), { target: { value: '65536' } });
  save();

  await screen.findByText('Default models saved.');
  expect(calls.find((call) => call.method === 'PUT')?.body).toEqual({
    roles: { ...ollamaReader, ollamaContextTokens: 65_536 },
  });
});

it('DEC-114 Auto leaves the size out of the saved setting', async () => {
  const { calls } = renderPage(<AdminModelsPage />, withRoles(ollamaReader), root);
  await screen.findByLabelText('Reader provider');

  save();

  await screen.findByText('Default models saved.');
  expect(calls.find((call) => call.method === 'PUT')?.body).toEqual({ roles: ollamaReader });
});

it('RF-401 a saved size shows as a number', async () => {
  renderPage(
    <AdminModelsPage />,
    withRoles({ ...ollamaReader, ollamaContextTokens: 32_768 }),
    root,
  );

  await screen.findByLabelText('Reader provider');

  expect(mode().value).toBe('number');
  expect(size().value).toBe('32768');
});

it('RF-401 the size is not sent when no role uses Ollama any more', async () => {
  const { calls } = renderPage(
    <AdminModelsPage />,
    withRoles({ ...ollamaReader, ollamaContextTokens: 32_768 }),
    root,
  );
  await screen.findByLabelText('Reader provider');

  fireEvent.change(screen.getByLabelText('Reader provider'), { target: { value: '' } });
  save();

  await screen.findByText('Default models saved.');
  expect(calls.find((call) => call.method === 'PUT')?.body).toEqual({ roles: {} });
});

it.each([
  ['2048', /at least 4,096/u],
  ['200000', /at most 131,072/u],
  ['x', /whole number/u],
])(
  'Q-23 a size of "%s" is refused next to the field and nothing is sent',
  async (text, message) => {
    const { calls } = renderPage(<AdminModelsPage />, withRoles(ollamaReader), root);
    await screen.findByLabelText('Reader provider');

    fireEvent.change(mode(), { target: { value: 'number' } });
    fireEvent.input(size(), { target: { value: text } });
    save();

    expect(await screen.findByText(message)).toBeTruthy();
    expect(size().getAttribute('aria-invalid')).toBe('true');
    expect(calls.some((call) => call.method === 'PUT')).toBe(false);
  },
);

it('RF-401 a refusal of the server for the field shows next to it', async () => {
  renderPage(
    <AdminModelsPage />,
    {
      ...withRoles(ollamaReader),
      'PUT /api/admin/default-roles': failure(400, 'RST-1005', [
        { field: 'ollamaContextTokens', code: 'RST-1006' },
      ]),
    },
    root,
  );
  await screen.findByLabelText('Reader provider');

  save();

  expect(await screen.findByText(/Message of RST-1006/u)).toBeTruthy();
});

// Q-44: the number is bounded by the smallest trained context among the models of the Ollama roles.

const trainedList = (trained: number | undefined): Response =>
  json(200, {
    provider: 'ollama',
    models: [
      {
        model: 'gemma4:e4b',
        label: 'gemma4:e4b',
        priced: true,
        ...(trained === undefined ? {} : { trainedContext: trained }),
      },
    ],
  });

async function tryTokens(answer: Response, text: string) {
  const page = renderPage(
    <AdminModelsPage />,
    { ...withRoles(ollamaReader), 'GET /api/models/ollama': answer },
    root,
  );
  await screen.findByLabelText('Reader provider');
  await waitFor(() => {
    expect(screen.getByLabelText('Reader model').tagName).toBe('SELECT');
  });
  fireEvent.change(mode(), { target: { value: 'number' } });
  fireEvent.input(size(), { target: { value: text } });
  save();
  return page;
}

it('Q-44 a size above the trained context of the reader model is refused with its name', async () => {
  const { calls } = await tryTokens(trainedList(8192), '9000');

  expect(await screen.findByText(/gemma4:e4b was trained for 8,192 tokens/u)).toBeTruthy();
  expect(calls.some((call) => call.method === 'PUT')).toBe(false);
});

it('Q-44 the trained context itself is saved', async () => {
  const { calls } = await tryTokens(trainedList(8192), '8192');

  await screen.findByText('Default models saved.');
  expect(calls.find((call) => call.method === 'PUT')?.body).toEqual({
    roles: { ...ollamaReader, ollamaContextTokens: 8192 },
  });
});

it('Q-44 a trained context above 131,072 allows a larger size', async () => {
  const { calls } = await tryTokens(trainedList(262_144), '200000');

  await screen.findByText('Default models saved.');
  expect(calls.find((call) => call.method === 'PUT')?.body).toEqual({
    roles: { ...ollamaReader, ollamaContextTokens: 200_000 },
  });
});

it('Q-44 with no trained context known the bound falls back to 131,072', async () => {
  await tryTokens(trainedList(undefined), '131073');

  expect(await screen.findByText(/at most 131,072 tokens\./u)).toBeTruthy();
});
