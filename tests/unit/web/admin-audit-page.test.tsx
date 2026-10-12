import { fireEvent, screen, waitFor, within } from '@testing-library/preact';
import { expect, it } from 'vitest';
import { AdminAuditPage } from '../../../web/src/pages/AdminAuditPage.js';
import { accountBody, cap, root } from './admin-fixtures.js';
import { json, renderPage, type Answer } from './fake-api.js';

// RF-1109, design-system.md section 14 (audit): the last 30 days newest first, filtered by user and
// action; the actor and the target of a row are shown by user name.

const event = (id: string, patch: Readonly<Record<string, unknown>> = {}) => ({
  id,
  at: '2026-10-11T14:06:51.000Z',
  actorUserId: 'u-1',
  action: 'key.saved',
  targetType: 'provider',
  targetId: 'openai',
  ip: '83.44.12.9',
  outcome: 'ok',
  detail: {},
  ...patch,
});

const since = '2026-09-11T00:00:00.000Z';

const base: Readonly<Record<string, Answer>> = {
  'GET /api/admin/users': json(200, {
    users: [accountBody('u-root', 'blacklight', { role: 'admin' }), accountBody('u-1', 'ana.ruiz')],
  }),
  'GET /api/admin/caps': json(200, cap('500000', '1000000', '10000000')),
  'GET /api/admin/audit': json(200, {
    since,
    truncated: false,
    events: [
      event('e-2'),
      event('e-1', {
        actorUserId: null,
        action: 'auth.sign_in',
        outcome: 'failed',
        targetType: 'user',
        targetId: 'u-1',
      }),
    ],
  }),
};

const render = (answers: Readonly<Record<string, Answer>> = {}) =>
  renderPage(<AdminAuditPage />, { ...base, ...answers }, root);

it('RF-1109 lists the events newest first with actor, action, target, address and outcome', async () => {
  render();

  const table = await screen.findByRole('table', { name: 'Audit events' });

  const [first, second] = within(table).getAllByRole('row').slice(1);
  expect(first?.textContent).toContain('ana.ruiz');
  expect(first?.textContent).toContain('key.saved');
  expect(first?.textContent).toContain('provider openai');
  expect(first?.textContent).toContain('83.44.12.9');
  expect(first?.textContent).toContain('2026-10-11 14:06:51');
  expect(second?.textContent).toContain('anonymous');
  expect(second?.textContent).toContain('user ana.ruiz');
  expect(second?.textContent).toContain('failed');
  expect(screen.getByText('Showing 2 events · newest first')).not.toBeNull();
});

it('RF-1109 asks the server for the chosen user and action', async () => {
  const { calls } = render();
  await screen.findByRole('table', { name: 'Audit events' });

  fireEvent.change(screen.getByLabelText('User'), { target: { value: 'u-1' } });
  fireEvent.change(screen.getByLabelText('Action'), { target: { value: 'key.saved' } });

  await waitFor(() => {
    expect(calls.at(-1)?.path).toBe('/api/admin/audit?userId=u-1&action=key.saved');
  });
});

it('RF-1109 says when no event matches', async () => {
  render({ 'GET /api/admin/audit': json(200, { since, truncated: false, events: [] }) });

  expect(
    await screen.findByText('No events match these filters in the last 30 days.'),
  ).not.toBeNull();
});

it('RF-1109 a list cut at the server limit says so', async () => {
  render({
    'GET /api/admin/audit': json(200, { since, truncated: true, events: [event('e-9')] }),
  });

  expect(await screen.findByText(/Showing the newest 1 event/u)).not.toBeNull();
});
