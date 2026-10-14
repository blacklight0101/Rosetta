import { fireEvent, screen, waitFor, within } from '@testing-library/preact';
import { expect, it } from 'vitest';
import { ProjectsPage } from '../../../web/src/pages/ProjectsPage.js';
import { failure, json, renderPage, type Answer } from './fake-api.js';
import { lastRunOf, overviewRow, projectOf } from './project-fixtures.js';

// RF-1008, RF-1108, RF-1010, design-system.md section 14 (Projects, queue notice): each project row
// shows its last run, state, runs, tokens and cost from GET /api/projects/overview, and a queued
// latest run gets the queue notice with its position and Cancel queued run.

const demo = projectOf('p-1', 'octo/demo');
const shop = projectOf('p-2', 'acme/shop');
const overviewPath = 'GET /api/projects/overview';

const paidTotals = {
  calls: 3,
  inputTokens: 1_200_000,
  outputTokens: 84_903,
  cachedInputTokens: 0,
  cost: [{ currency: 'USD', costMicros: '3470000' }],
  unknownCostCalls: 0,
  priceTableVersions: ['2026-10-11'],
};

const queuedRun = lastRunOf({
  id: 'r-9',
  stage: 'understand',
  queueState: 'Queued',
  endState: null,
  startedAt: null,
  endedAt: null,
  position: 2,
});

const renderProjects = (answers: Readonly<Record<string, Answer>>) =>
  renderPage(<ProjectsPage />, answers);

async function rowOf(name: string): Promise<HTMLElement> {
  const cells = await screen.findAllByText(name);
  for (const cell of cells) {
    const row = cell.closest('tr');
    if (row !== null) return row;
  }
  throw new Error(`No row for ${name}.`);
}

it('RF-1008 shows the last run, its state, the runs, tokens and cost of each project', async () => {
  renderProjects({
    [overviewPath]: json(200, {
      projects: [
        overviewRow(demo, { runs: 6, totals: paidTotals, lastRun: lastRunOf() }),
        overviewRow(shop),
      ],
      truncated: false,
    }),
  });

  const row = await rowOf('octo/demo');
  const headers = screen.getAllByRole('columnheader').map((cell) => cell.textContent);

  expect(headers).toEqual(
    expect.arrayContaining(['Repository', 'Last run', 'State', 'Runs', 'Tokens', 'Cost']),
  );
  expect(row.textContent).toContain('scan · 2026-10-12');
  expect(within(row).getByText('Completed')).not.toBeNull();
  expect(within(row).getByText('6')).not.toBeNull();
  expect(within(row).getByText('1,284,903')).not.toBeNull();
  expect(within(row).getByText('$3.47')).not.toBeNull();
  const empty = await rowOf('acme/shop');
  expect(empty.textContent).toContain('No run yet');
  expect(within(empty).getByText('$0.00')).not.toBeNull();
});

it('RF-1108 a queued latest run shows its position in the row and the queue notice', async () => {
  renderProjects({
    [overviewPath]: json(200, {
      projects: [overviewRow(demo, { runs: 1, lastRun: queuedRun })],
      truncated: false,
    }),
  });

  const row = await rowOf('octo/demo');
  const notice = screen.getByTestId('queue-notice');

  expect(within(row).getByText('Queued')).not.toBeNull();
  expect(row.textContent).toContain('position 2');
  expect(notice.textContent).toContain('Your understand run of octo/demo is queued, position 2.');
  expect(within(notice).getByRole('button', { name: /Cancel queued run/u })).not.toBeNull();
  expect(within(notice).getByRole('link', { name: 'Open the live run' }).getAttribute('href')).toBe(
    '/runs/r-9',
  );
});

it('RF-1108 Cancel queued run stops the run by its id with the CSRF token and reads the list again', async () => {
  let cancelled = false;
  const { calls } = renderProjects({
    [overviewPath]: () => {
      const lastRun = cancelled
        ? lastRunOf({ id: 'r-9', queueState: 'Ended', endState: 'Interrupted', position: null })
        : queuedRun;
      return json(200, { projects: [overviewRow(demo, { runs: 1, lastRun })], truncated: false });
    },
    'POST /api/runs/r-9/stop': () => {
      cancelled = true;
      return json(200, { ...queuedRun, projectId: 'p-1', commitSha: null, totals: {} });
    },
  });
  const notice = await screen.findByTestId('queue-notice');

  fireEvent.click(within(notice).getByRole('button', { name: /Cancel queued run/u }));

  await waitFor(() => {
    expect(screen.queryByTestId('queue-notice')).toBeNull();
  });
  expect(calls).toContainEqual({
    method: 'POST',
    path: '/api/runs/r-9/stop',
    csrf: 'csrf-0',
    body: undefined,
  });
  expect(within(await rowOf('octo/demo')).getByText('Interrupted')).not.toBeNull();
  expect(calls.filter((call) => call.path === '/api/projects/overview')).toHaveLength(2);
});

it('RF-1108 a cancel that fails shows its error in the notice and keeps the button', async () => {
  renderProjects({
    [overviewPath]: json(200, {
      projects: [overviewRow(demo, { runs: 1, lastRun: queuedRun })],
      truncated: false,
    }),
    'POST /api/runs/r-9/stop': failure(409, 'RST-2001'),
  });
  const notice = await screen.findByTestId('queue-notice');

  fireEvent.click(within(notice).getByRole('button', { name: /Cancel queued run/u }));

  expect((await within(notice).findByRole('alert')).textContent).toContain('RST-2001');
  expect(within(notice).getByRole('button', { name: /Cancel queued run/u })).not.toBeNull();
});
