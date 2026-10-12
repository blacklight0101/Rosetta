import { fireEvent, screen, waitFor, within } from '@testing-library/preact';
import { expect, it } from 'vitest';
import { AdminUsersPage } from '../../../web/src/pages/AdminUsersPage.js';
import { accountBody, cap, root } from './admin-fixtures.js';
import { failure, json, renderPage } from './fake-api.js';

// RNF-010, design-system.md section 8, RF-1102: a refused account form moves focus to the invalid
// field, which reads its own error, so the error is not announced a second time; a refusal that
// names no field goes to a banner with its code.

const answers = {
  'GET /api/admin/users': json(200, { users: [accountBody('u-1', 'ana.ruiz')] }),
  'GET /api/admin/caps': json(200, cap('500000', '1000000', '10000000')),
};

it('RNF-010 focuses the invalid field of the create form and does not announce its error twice', async () => {
  renderPage(
    <AdminUsersPage />,
    {
      ...answers,
      'POST /api/admin/users': failure(400, 'RST-2204', [{ field: 'password', code: 'RST-2204' }]),
    },
    root,
  );
  await screen.findByText('ana.ruiz');
  const form = within(screen.getByRole('region', { name: 'Create an account' }));

  fireEvent.click(form.getByRole('button', { name: 'Create account' }));

  const field = form.getByLabelText('Initial password');
  await waitFor(() => {
    expect(document.activeElement).toBe(field);
  });
  expect(screen.getByTestId('field-error').getAttribute('role')).toBeNull();
});

it('RF-1102 shows a refusal that names no field as a banner with its code', async () => {
  renderPage(
    <AdminUsersPage />,
    { ...answers, 'POST /api/admin/users/u-1/disable': failure(404, 'RST-2003') },
    root,
  );
  await screen.findByText('ana.ruiz');

  fireEvent.click(screen.getByRole('button', { name: /^Disable/u }));

  const banner = await screen.findByTestId('error-banner');
  expect(banner.textContent).toContain('RST-2003');
});
