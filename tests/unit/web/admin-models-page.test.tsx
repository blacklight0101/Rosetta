import { fireEvent, screen } from '@testing-library/preact';
import { expect, it } from 'vitest';
import { AdminModelsPage } from '../../../web/src/pages/AdminModelsPage.js';
import { accountBody, cap, root } from './admin-fixtures.js';
import { json, renderPage, type Answer } from './fake-api.js';

// DEC-106: the default provider and model per role for new projects; a role left on the template
// default is left out of the saved setting.

const base: Readonly<Record<string, Answer>> = {
  'GET /api/admin/users': json(200, { users: [accountBody('u-root', 'blacklight')] }),
  'GET /api/admin/caps': json(200, cap('500000', '1000000', '10000000')),
  'GET /api/admin/default-roles': json(200, {
    roles: { reader: { provider: 'ollama', model: 'gemma4:e4b' } },
  }),
};

it('DEC-106 shows the saved default of a role and the template default for the others', async () => {
  renderPage(<AdminModelsPage />, base, root);

  const provider = await screen.findByLabelText<HTMLSelectElement>('Reader provider');

  expect(provider.value).toBe('ollama');
  expect(screen.getByLabelText<HTMLInputElement>('Reader model').value).toBe('gemma4:e4b');
  expect(screen.getByLabelText<HTMLSelectElement>('Planner provider').value).toBe('');
});

it('DEC-106 saves only the roles that name a provider', async () => {
  const { calls } = renderPage(
    <AdminModelsPage />,
    {
      ...base,
      'PUT /api/admin/default-roles': json(200, {
        roles: { verifier: { provider: 'openai', model: 'gpt-4o-mini-2024-07-18' } },
      }),
    },
    root,
  );
  await screen.findByLabelText('Reader provider');

  fireEvent.change(screen.getByLabelText('Reader provider'), { target: { value: '' } });
  fireEvent.change(screen.getByLabelText('Verifier provider'), { target: { value: 'openai' } });
  fireEvent.input(screen.getByLabelText('Verifier model'), {
    target: { value: ' gpt-4o-mini-2024-07-18 ' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save default models' }));

  await screen.findByText('Default models saved.');
  expect(calls.find((call) => call.method === 'PUT')?.body).toEqual({
    roles: { verifier: { provider: 'openai', model: 'gpt-4o-mini-2024-07-18' } },
  });
});

it('DEC-106 a provider without a model is refused next to the model field and nothing is sent', async () => {
  const { calls } = renderPage(<AdminModelsPage />, base, root);
  await screen.findByLabelText('Reader provider');

  fireEvent.input(screen.getByLabelText('Reader model'), { target: { value: '  ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save default models' }));

  expect((await screen.findByLabelText('Reader model')).getAttribute('aria-invalid')).toBe('true');
  expect(calls.some((call) => call.method === 'PUT')).toBe(false);
});
