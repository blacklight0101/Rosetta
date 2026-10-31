import { fireEvent, screen } from '@testing-library/preact';
import { expect, it } from 'vitest';
import { AdminModelsPage } from '../../../web/src/pages/AdminModelsPage.js';
import { accountBody, cap, root } from './admin-fixtures.js';
import { json, renderPage } from './fake-api.js';

// DEC-106, P6-33 (the pattern P6-20 fixed in Plan setup): an edit made while the save is on its way
// stays; the answer of the save replaces only the draft that was sent.

it('DEC-106 an edit made while a save is on its way is not overwritten by its answer', async () => {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  renderPage(
    <AdminModelsPage />,
    {
      'GET /api/admin/users': json(200, { users: [accountBody('u-root', 'blacklight')] }),
      'GET /api/admin/caps': json(200, cap('500000', '1000000', '10000000')),
      'GET /api/admin/default-roles': json(200, {
        roles: { reader: { provider: 'ollama', model: 'gemma4:e4b' } },
      }),
      'PUT /api/admin/default-roles': async () => {
        await gate;
        return json(200, { roles: { reader: { provider: 'ollama', model: 'gemma4:e4b' } } });
      },
    },
    root,
  );
  await screen.findByLabelText('Reader provider');

  fireEvent.click(screen.getByRole('button', { name: 'Save default models' }));
  fireEvent.change(screen.getByLabelText('Planner provider'), { target: { value: 'openai' } });
  fireEvent.input(screen.getByLabelText('Planner model'), { target: { value: 'gpt-typed-late' } });
  release();

  await screen.findByText('Default models saved.');
  expect(screen.getByLabelText<HTMLSelectElement>('Planner provider').value).toBe('openai');
  expect(screen.getByLabelText<HTMLInputElement>('Planner model').value).toBe('gpt-typed-late');
});
