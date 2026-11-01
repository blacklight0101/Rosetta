import { expect, test } from './support/fixtures.js';
import { expectNoSeriousViolations } from './support/axe.js';
import { tokensOf } from './support/cost-run.js';
import {
  confirmation,
  openHistory,
  projectFolderOf,
  runRow,
  runsTable,
} from './support/history-page.js';
import {
  agentPanel,
  openRunTab,
  openScanRun,
  openStartPage,
  runStatus,
  startUnderstand,
} from './support/live-run-page.js';
import { accountFor } from './support/seed.js';
import { signInAs } from './support/sign-in.js';
import { transitionsDone } from './support/transitions.js';

// RF-1008, RF-1012, DEC-55, RF-1105, P1-40: the history page, driven by real runs of the test server
// (the model double replays the recorded understand run of the C# fixture, serve.ts). The steps run
// in order and share one project: a scan, an understand run that is stopped, the deletion of the
// scan run and then of the project. Nothing of the API is replaced.

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ context }, info) => {
  await signInAs(context, accountFor('history', info.project.name));
});

test('RF-1008 lists a finished run with its stage, commit, state and links, and the zip downloads', async ({
  page,
}) => {
  await openStartPage(page);
  await openScanRun(page);

  await openHistory(page);

  const row = runRow(page, '-scan');
  await expect(row).toContainText('Completed');
  await expect(row).toContainText('scan');
  await expect(row.getByRole('cell').nth(2)).toHaveText(/^[0-9a-f]{7}$/u);
  await expect(row.getByRole('link', { name: /^View run /u })).toBeVisible();
  await expectNoSeriousViolations(page);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    row.getByRole('link', { name: /^Zip of run/u }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/-scan\.zip$/u);
  await row.getByRole('link', { name: /^View run /u }).click();
  await expect(page.getByRole('heading', { name: 'Live run', level: 1 })).toBeVisible();
});

test('RF-1012 disables Delete while a run is in progress, with the reason, until it is stopped', async ({
  page,
}) => {
  // P1-121: this step timed out on phone-light while it waited for the reader to run inside the
  // 30 s test budget, after up to 8 s of the start stagger (removed by P1-120). The history checks
  // no longer wait for the run to start: queued and running are both "in progress" for RF-1012.
  // Only the stop waits for Controllers to run, so Catalog has spent what the next step counts.
  const live = await startUnderstand(page, ['Catalog', 'Controllers']);

  await openHistory(page);

  const row = runRow(page, '-understand');
  await expect(row).toContainText(/Queued|Running/u);
  const delete1 = row.getByRole('button', { name: /^Delete \((queued|running)\)/u });
  await expect(delete1).toBeDisabled();
  await expect(delete1).toHaveAttribute('title', 'Stop the run before deleting it');
  await expect(page.getByRole('button', { name: 'Delete project' })).toBeDisabled();
  await transitionsDone(page);
  await expectNoSeriousViolations(page);

  await page.goto(live);
  await openRunTab(page, 'All agents');
  await expect(agentPanel(page, 'Controllers')).toContainText('Running', { timeout: 30_000 });
  await page.getByRole('button', { name: 'Stop run' }).click();
  await expect(runStatus(page)).toContainText('Interrupted', { timeout: 30_000 });
  await openHistory(page);
  await expect(runRow(page, '-understand')).toContainText('Interrupted');
  await expect(
    runRow(page, '-understand').getByRole('button', { name: /^Delete:/u }),
  ).toBeEnabled();
});

test('RF-1012 DEC-55 deleting a run asks first, frees its folder and leaves the totals and the cost page alone', async ({
  page,
}) => {
  await openHistory(page);
  const pill = page.getByTestId('header-totals');
  // P1-121: both counts are read only once their element shows data; a bare `count()` or
  // `textContent()` read the page before its request had answered and kept 0 (seen on phone-dark).
  await expect.poll(() => tokensOf(pill)).toBeGreaterThan(0);
  const before = await tokensOf(pill);
  const costPage = page.getByRole('navigation').getByRole('link', { name: 'Cost' });
  await costPage.click();
  const costRows = page.getByRole('table', { name: 'By run' }).getByRole('link');
  await expect(costRows.first()).toBeVisible();
  const kept = await costRows.count();
  await openHistory(page);

  const row = runRow(page, '-understand');
  await row.getByRole('button', { name: /^Delete:/u }).click();
  const dialog = confirmation(page);
  await expect(dialog).toContainText(/projects\/[0-9a-f-]{36}\/runs\//u);
  await expect(dialog).toContainText(/\d+(\.\d)? (B|kB|MB)/u);
  await expect(dialog).toContainText('This cannot be undone.');
  await transitionsDone(page);
  await expectNoSeriousViolations(page);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: /^Delete:/u }).click();
  await dialog.getByRole('button', { name: 'Delete run' }).click();

  await expect(runRow(page, '-understand')).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: 'freed' })).toBeVisible();
  await expect(runRow(page, '-scan')).toBeVisible();
  expect(await tokensOf(pill)).toBe(before);
  await costPage.click();
  await expect(costRows).toHaveCount(kept);
});

test('RF-1012 deleting the project asks first, names its folder, removes it and keeps the totals', async ({
  page,
}) => {
  await openHistory(page);
  const pill = page.getByTestId('header-totals');
  const before = await tokensOf(pill);
  const folder = await projectFolderOf(page);

  await page.getByRole('button', { name: 'Delete project' }).click();
  const dialog = confirmation(page);
  await expect(dialog).toContainText(folder);
  await expect(dialog).toContainText('This cannot be undone.');
  await transitionsDone(page);
  await expectNoSeriousViolations(page);
  await dialog.getByRole('button', { name: 'Delete project' }).click();

  await expect(page.getByRole('heading', { name: 'Projects', level: 1 })).toBeVisible();
  await expect(page.getByText('No projects yet')).toBeVisible();
  expect(await tokensOf(pill)).toBe(before);
  await page.goto(`/${folder}/history`);
  await expect(page.getByTestId('error-banner')).toContainText('RST-2003');
});

test('RF-1105 answers the history of an unknown project like any other with the same error and no table', async ({
  page,
}) => {
  await page.goto('/projects/00000000-0000-4000-8000-000000000000/history');

  await expect(page.getByTestId('error-banner')).toContainText('RST-2003');
  await expect(runsTable(page)).toHaveCount(0);
  await expectNoSeriousViolations(page);
});

test('RF-1102 refuses the snapshot list to a user who is not the administrator and shows no snapshot', async ({
  page,
}) => {
  await page.goto('/projects');

  const answer = await page.evaluate(async () => {
    const response = await fetch('/api/admin/snapshots');
    return { status: response.status, body: await response.text() };
  });

  expect(answer.status).toBe(403);
  expect(answer.body).not.toContain('octo/');
});
