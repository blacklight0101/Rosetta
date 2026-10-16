import { screen, waitFor, within } from '@testing-library/preact';
import { afterEach, expect, it, vi } from 'vitest';
import { HistoryPage } from '../../../web/src/pages/HistoryPage.js';
import { ProjectsPage } from '../../../web/src/pages/ProjectsPage.js';
import { json, renderPage } from './fake-api.js';
import { agentEnded, planned, runEnded } from './live-run-fixtures.js';
import { doneKey, history, scanKey } from './history-fixtures.js';
import { renderLive, runPath, runRow } from './live-run-helpers.js';
import { lastRunOf, overviewRow, projectOf } from './project-fixtures.js';

// RF-208, RF-1008, RF-1002: a run that ended with areas that gave no usable card is never shown as
// a plain Completed anywhere: the history list, the Projects table and the status bar of the run
// page say "N areas failed" next to the state, from the count kept on the run row.

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.pushState({}, '', '/');
});

const withFailures = {
  ...history,
  runs: history.runs
    .slice(1)
    .map((run) => (run.runId === doneKey ? { ...run, failedAreas: 2 } : run)),
};

async function rowOf(runKey: string): Promise<HTMLElement> {
  const [cell] = await screen.findAllByText(runKey);
  const row = cell?.closest('tr') ?? null;
  if (row === null) throw new Error(`No row for ${runKey}.`);
  return row;
}

it('RF-208 the history list says how many areas failed next to Completed, and only for that run', async () => {
  renderPage(
    <HistoryPage />,
    { 'GET /api/projects/p-1/history': json(200, withFailures) },
    undefined,
    { projectId: 'p-1' },
  );

  const failed = within(await rowOf(doneKey));
  const clean = within(await rowOf(scanKey));

  expect(failed.getByText('Completed')).not.toBeNull();
  expect(failed.getByText('2 areas failed')).not.toBeNull();
  expect(clean.queryByText(/failed/u)).toBeNull();
});

it('RF-208 the Projects table says how many areas failed next to the state of the last run', async () => {
  const demo = projectOf('p-1', 'octo/demo');
  const shop = projectOf('p-2', 'acme/shop');
  renderPage(<ProjectsPage />, {
    'GET /api/projects/overview': json(200, {
      projects: [
        overviewRow(demo, { runs: 1, lastRun: lastRunOf({ failedAreas: 1 }) }),
        overviewRow(shop, { runs: 1, lastRun: lastRunOf({ id: 'r-2', failedAreas: 0 }) }),
      ],
      truncated: false,
    }),
  });

  const demoRow = (await screen.findByText('octo/demo')).closest('tr');
  const shopRow = (await screen.findByText('acme/shop')).closest('tr');
  if (demoRow === null || shopRow === null) throw new Error('A project row is missing.');

  expect(within(demoRow).getByText('1 area failed')).not.toBeNull();
  expect(within(shopRow).queryByText(/failed/u)).toBeNull();
});

it('RF-208 the status bar of the run page says how many areas failed next to Completed', async () => {
  renderLive({
    [`GET ${runPath}`]: runRow({ queueState: 'Ended', endState: 'Completed', failedAreas: 2 }),
  });

  const status = await screen.findByTestId('run-status');

  expect(status.textContent).toContain('Completed');
  expect(status.textContent).toContain('2 areas failed');
});

it('RF-208 the status bar of a run without failed areas says nothing of them', async () => {
  renderLive({ [`GET ${runPath}`]: runRow({ queueState: 'Ended', endState: 'Completed' }) });

  const status = await screen.findByTestId('run-status');

  expect(status.textContent).toContain('Completed');
  expect(status.textContent).not.toContain('failed');
});

it('RF-208 a run that ends while its page is open says it at once, from the ended event', async () => {
  const { stream } = renderLive();
  const connection = await stream.connection();

  connection.event(planned(1, 'reader-001', 'Catalog'));
  connection.event(agentEnded(2, 'reader-001', 'InvalidOutput'));
  connection.event(runEnded(3, 'Completed', undefined, 1));

  await waitFor(() => {
    expect(screen.getByTestId('run-status').textContent).toContain('1 area failed');
  });
});
