import { fireEvent, screen, waitFor, within } from '@testing-library/preact';
import { expect, it } from 'vitest';
import { AdminUsersPage } from '../../../web/src/pages/AdminUsersPage.js';
import { accountBody, cap, root, spent } from './admin-fixtures.js';
import { failure, json, renderPage, type Answer } from './fake-api.js';

// RF-1102, RF-1105, RF-1106, design-system.md section 14 (administration): accounts with their
// state and cost, the actions, the create form with the refusal next to the field, the caps and
// the warning from 80% of the server monthly cap.

const ana = accountBody('u-1', 'ana.ruiz', { projects: 3, monthToDate: spent('2100000') });
const old = accountBody('u-2', 'test2', { state: 'Disabled', lastSignInAt: null });
const me = accountBody('u-root', 'blacklight', { role: 'admin', monthToDate: spent('6100000') });

const base: Readonly<Record<string, Answer>> = {
  'GET /api/admin/users': json(200, { users: [me, ana, old] }),
  'GET /api/admin/caps': json(200, cap('500000', '1000000', '10000000')),
};

const render = (answers: Readonly<Record<string, Answer>> = {}) =>
  renderPage(<AdminUsersPage />, { ...base, ...answers }, root);

function rowOf(name: string): HTMLElement {
  const row = screen.getByText(name).closest('tr');
  if (row === null) throw new Error(`No row for ${name}.`);
  return row;
}

it('RF-1102 lists each account with role, state, last sign-in, projects and month-to-date cost', async () => {
  render();

  await screen.findByText('ana.ruiz');

  const row = rowOf('ana.ruiz');
  for (const text of ['user', 'Active', '3', '$2.10']) {
    expect(within(row).getByText(text)).not.toBeNull();
  }
  expect(within(rowOf('test2')).getByText('never')).not.toBeNull();
  expect(within(rowOf('test2')).getByText('Disabled')).not.toBeNull();
});

it('RF-1102 offers no disable or reset for the own account, enable for a disabled one', async () => {
  render();
  await screen.findByText('ana.ruiz');

  const own = within(rowOf('blacklight'));
  expect(own.queryByRole('button', { name: /^Disable/u })).toBeNull();
  expect(own.queryByRole('button', { name: /^Reset password/u })).toBeNull();
  expect(within(rowOf('test2')).getByRole('button', { name: /^Enable/u })).not.toBeNull();
  expect(within(rowOf('ana.ruiz')).getByRole('button', { name: /^Disable/u })).not.toBeNull();
});

it('RF-1102 disabling an account sends the change and shows the new state', async () => {
  const { calls } = render({
    'POST /api/admin/users/u-1/disable': json(200, {
      user: accountBody('u-1', 'ana.ruiz', { state: 'Disabled' }),
    }),
  });
  await screen.findByText('ana.ruiz');

  fireEvent.click(within(rowOf('ana.ruiz')).getByRole('button', { name: /^Disable/u }));

  await waitFor(() => {
    expect(within(rowOf('ana.ruiz')).getByText('Disabled')).not.toBeNull();
  });
  expect(calls.some((call) => call.path === '/api/admin/users/u-1/disable')).toBe(true);
  expect(within(rowOf('ana.ruiz')).getByText('$2.10')).not.toBeNull();
});

it('RF-1102 creating an account sends the form, defaulting to a forced password change', async () => {
  const { calls } = render({
    'POST /api/admin/users': json(201, { user: accountBody('u-3', 'new.person') }),
  });
  await screen.findByText('ana.ruiz');
  const form = within(screen.getByRole('region', { name: 'Create an account' }));

  fireEvent.input(form.getByLabelText('User name'), { target: { value: 'new.person' } });
  fireEvent.input(form.getByLabelText('Display name'), { target: { value: 'New Person' } });
  fireEvent.input(form.getByLabelText('Initial password'), { target: { value: 'pw-pieces-1234' } });
  fireEvent.click(form.getByRole('button', { name: 'Create account' }));

  await screen.findByText(/Created account new.person/u);
  const sent = calls.find((call) => call.path === '/api/admin/users' && call.method === 'POST');
  expect(sent?.body).toEqual({
    userName: 'new.person',
    displayName: 'New Person',
    role: 'user',
    password: 'pw-pieces-1234',
    mustChangePassword: true,
  });
  expect(form.getByLabelText<HTMLInputElement>('Initial password').value).toBe('');
  expect(screen.getByText('new.person')).not.toBeNull();
});

it('RF-1102 a refused user name shows its code next to the field', async () => {
  render({
    'POST /api/admin/users': failure(409, 'RST-2201', [{ field: 'userName', code: 'RST-2201' }]),
  });
  await screen.findByText('ana.ruiz');
  const form = within(screen.getByRole('region', { name: 'Create an account' }));

  fireEvent.input(form.getByLabelText('User name'), { target: { value: 'ana.ruiz' } });
  fireEvent.click(form.getByRole('button', { name: 'Create account' }));

  const error = await screen.findByTestId('field-error');
  expect(error.textContent).toContain('RST-2201');
  expect(form.getByLabelText('User name').getAttribute('aria-invalid')).toBe('true');
});

it('RF-1106 saves the caps in micro-dollars from dollars', async () => {
  const { calls } = render({
    'PUT /api/admin/caps': json(200, cap('250000', '2000000', '12500000')),
  });
  await screen.findByText('ana.ruiz');
  const caps = within(screen.getByRole('region', { name: 'Caps on server keys' }));

  fireEvent.input(caps.getByLabelText('Per run (USD)'), { target: { value: '0.25' } });
  fireEvent.input(caps.getByLabelText('Per user per day (USD)'), { target: { value: '2' } });
  fireEvent.input(caps.getByLabelText('Server per month (USD)'), { target: { value: '12.5' } });
  fireEvent.click(caps.getByRole('button', { name: 'Save caps' }));

  await screen.findByText('Caps saved.');
  const sent = calls.find((call) => call.method === 'PUT');
  expect(sent?.body).toEqual({
    runMicros: '250000',
    userDayMicros: '2000000',
    serverMonthMicros: '12500000',
  });
});

it('RF-1106 a negative run cap goes to the server and shows its code next to the field', async () => {
  const { calls } = render({
    'PUT /api/admin/caps': failure(422, 'RST-1005', [{ field: 'runMicros', code: 'RST-1003' }]),
  });
  await screen.findByText('ana.ruiz');
  const caps = within(screen.getByRole('region', { name: 'Caps on server keys' }));

  fireEvent.input(caps.getByLabelText('Per run (USD)'), { target: { value: '-1' } });
  fireEvent.click(caps.getByRole('button', { name: 'Save caps' }));

  const error = await screen.findByTestId('field-error');
  expect(error.textContent).toContain('RST-1003');
  expect(calls.find((call) => call.method === 'PUT')?.body).toEqual({
    runMicros: '-1000000',
    userDayMicros: '1000000',
    serverMonthMicros: '10000000',
  });
});

it('DEC-117 a run cap above 100 USD is refused on its field without a request', async () => {
  const { calls } = render();
  await screen.findByText('ana.ruiz');
  const caps = within(screen.getByRole('region', { name: 'Caps on server keys' }));

  fireEvent.input(caps.getByLabelText('Per run (USD)'), { target: { value: '100.5' } });
  fireEvent.click(caps.getByRole('button', { name: 'Save caps' }));

  expect(await screen.findByText('Enter an amount in dollars, for example 0.50.')).toBeTruthy();
  expect(calls.some((call) => call.method === 'PUT')).toBe(false);
});

it('RF-1106 at 82% of the monthly cap shows the meter and leaves the banner to the shell slot', async () => {
  render({
    'GET /api/admin/caps': json(200, cap('500000', '1000000', '10000000', spent('8200000'))),
  });

  const meter = await screen.findByRole('meter', { name: 'Server spend this month' });

  expect(meter.textContent).toContain('$8.20');
  expect(screen.queryByText(/The server has used/u)).toBeNull();
});

it('RF-1106 shows no banner at 21% of the monthly cap', async () => {
  render({
    'GET /api/admin/caps': json(200, cap('500000', '1000000', '10000000', spent('2100000'))),
  });
  await screen.findByText('ana.ruiz');

  expect(screen.queryByText(/The server has used/u)).toBeNull();
  expect(screen.getByRole('meter', { name: 'Server spend this month' })).not.toBeNull();
});

it('RF-1106 spend on own keys alone does not trigger the banner or fill the meter', async () => {
  const ownKeys = accountBody('u-4', 'rich.own', { monthToDate: spent('9500000') });
  render({ 'GET /api/admin/users': json(200, { users: [me, ana, ownKeys] }) });
  await screen.findByText('rich.own');

  expect(screen.queryByText(/The server has used/u)).toBeNull();
  expect(screen.getByRole('meter', { name: 'Server spend this month' }).textContent).toContain(
    '$0.00',
  );
});

it('RF-1105 opening a workspace lists the projects of that account', async () => {
  render({
    'GET /api/admin/users/u-1/projects': json(200, {
      owner: { id: 'u-1', userName: 'ana.ruiz', displayName: 'Ana Ruiz' },
      projects: [],
    }),
  });
  await screen.findByText('ana.ruiz');

  fireEvent.click(within(rowOf('ana.ruiz')).getByRole('button', { name: /^Open workspace/u }));

  const panel = await screen.findByRole('region', { name: 'Workspace of ana.ruiz' });
  expect(panel.textContent).toContain('no projects');
});
