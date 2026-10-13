import { fireEvent, screen, waitFor, within } from '@testing-library/preact';
import { expect, it } from 'vitest';
import { AdminAuditPage } from '../../../web/src/pages/AdminAuditPage.js';
import { AdminUsersPage } from '../../../web/src/pages/AdminUsersPage.js';
import { accountBody, cap, root } from './admin-fixtures.js';
import { json, renderPage, type Answer } from './fake-api.js';

// RF-1102, RF-1104, RF-1109, P1-107 (AdminUsers.dc.html, AdminAudit.dc.html): the accounts table
// filters by name and shows whether each account may use the server's keys; the audit view also
// narrows by period and outcome.

const users = [
  accountBody('u-root', 'blacklight', { role: 'admin', displayName: 'BlackLigth' }),
  accountBody('u-1', 'ana.ruiz', { displayName: 'Ana Ruiz' }),
  accountBody('u-2', 'test2', { displayName: 'Former tester', serverKeysAllowed: false }),
];

const base: Readonly<Record<string, Answer>> = {
  'GET /api/admin/users': json(200, { users }),
  'GET /api/admin/caps': json(200, cap('500000', '1000000', '10000000')),
  'GET /api/admin/audit': json(200, {
    since: '2026-09-11T00:00:00.000Z',
    truncated: false,
    events: [],
  }),
};

function accountsTable(): HTMLElement {
  return screen.getByRole('table', { name: 'Accounts' });
}

function userNames(): readonly string[] {
  return within(accountsTable())
    .getAllByRole('row')
    .slice(1)
    .map((row) => row.querySelector('.rst-mono')?.textContent ?? '');
}

it('RF-1102 the name filter keeps the accounts whose user name or display name contains it', async () => {
  renderPage(<AdminUsersPage />, base, root);
  await screen.findByText('ana.ruiz');

  fireEvent.input(screen.getByLabelText('Filter by name'), { target: { value: 'ANA' } });
  expect(userNames()).toEqual(['ana.ruiz']);
  fireEvent.input(screen.getByLabelText('Filter by name'), { target: { value: 'former' } });
  expect(userNames()).toEqual(['test2']);
  fireEvent.input(screen.getByLabelText('Filter by name'), { target: { value: '' } });
  expect(userNames()).toEqual(['blacklight', 'ana.ruiz', 'test2']);
});

it('RF-1102 a name filter that matches no account says so', async () => {
  renderPage(<AdminUsersPage />, base, root);
  await screen.findByText('ana.ruiz');

  fireEvent.input(screen.getByLabelText('Filter by name'), { target: { value: 'nobody' } });

  expect(screen.getByText('No account matches "nobody".')).not.toBeNull();
});

it("RF-1104 the accounts table shows whether each account may use the server's keys", async () => {
  renderPage(<AdminUsersPage />, base, root);
  await screen.findByText('ana.ruiz');

  const header = within(accountsTable()).getByRole('columnheader', { name: 'Server keys' });
  const rowOf = (name: string) => screen.getByText(name).closest('tr');

  expect(header).not.toBeNull();
  expect(rowOf('ana.ruiz')?.textContent).toContain('allowed');
  expect(rowOf('test2')?.textContent).toContain('not allowed');
});

it('RF-1109 asks the server for the chosen period and outcome, and Clear filters resets them', async () => {
  const { calls } = renderPage(<AdminAuditPage />, base, root);
  await screen.findByText(/No events match/u);
  const period = screen.getByLabelText('Period');

  expect(period).toHaveProperty('value', '30');
  fireEvent.change(period, { target: { value: '7' } });
  fireEvent.change(screen.getByLabelText('Outcome'), { target: { value: 'refused' } });

  await waitFor(() => {
    expect(calls.at(-1)?.path).toBe('/api/admin/audit?days=7&outcome=refused');
  });
  expect(await screen.findByText('No events match these filters in the last 7 days.')).not.toBe(
    null,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
  await waitFor(() => {
    expect(calls.at(-1)?.path).toBe('/api/admin/audit');
  });
  expect(screen.getByLabelText('Outcome')).toHaveProperty('value', '');
});

it('RF-1109 the last 24 hours read as such in the empty message', async () => {
  renderPage(<AdminAuditPage />, base, root);
  await screen.findByText(/No events match/u);

  fireEvent.change(screen.getByLabelText('Period'), { target: { value: '1' } });

  expect(
    await screen.findByText('No events match these filters in the last 24 hours.'),
  ).not.toBeNull();
});
