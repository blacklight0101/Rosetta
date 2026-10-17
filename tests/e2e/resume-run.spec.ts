import { expect, test } from './support/fixtures.js';
import { expectNoSeriousViolations } from './support/axe.js';
import { openScannedStartPage } from './support/cost-run.js';
import { openHistory, runRow } from './support/history-page.js';
import { agentPanel, openRunTab, runStatus, startUnderstand } from './support/live-run-page.js';
import { accountFor } from './support/seed.js';
import { signInAs } from './support/sign-in.js';
import { transitionsDone } from './support/transitions.js';

// RF-006, ADR-007: the Resume buttons of the history page and the run page, driven by real runs of
// the test server (the model double replays the recorded understand run of the C# fixture and holds
// the Controllers reader until the run is stopped, e2e-provider.ts). The run is stopped at
// Controllers after Catalog finished; resuming it runs the same run again from Controllers only.

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ context }, info) => {
  await signInAs(context, accountFor('live-controls', info.project.name));
});

test('RF-006 resumes an interrupted run from the history page: the same run, its finished agent kept', async ({
  page,
}) => {
  // The project has no code map until a scan ran; the scan comes first and the run after it.
  test.setTimeout(120_000);
  await openScannedStartPage(page);
  const live = await startUnderstand(page, ['Catalog', 'Controllers']);
  await openRunTab(page, 'All agents');
  await expect(agentPanel(page, 'Controllers')).toContainText('Running', { timeout: 30_000 });
  await page.getByRole('button', { name: 'Stop run' }).click();
  await expect(runStatus(page)).toContainText('Interrupted', { timeout: 30_000 });
  await openHistory(page);
  const row = runRow(page, '-understand');
  await expect(row).toContainText('Interrupted');
  await expect(row.getByRole('button', { name: /^Resume run /u })).toBeEnabled();
  await transitionsDone(page);
  await expectNoSeriousViolations(page);

  await row.getByRole('button', { name: /^Resume run /u }).click();

  await expect(page).toHaveURL(live);
  await openRunTab(page, 'All agents');
  await expect(runStatus(page)).toContainText('Running', { timeout: 30_000 });
  await expect(agentPanel(page, 'Catalog')).toContainText('Done');
  await expect(agentPanel(page, 'Controllers')).toContainText('Running', { timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Resume run' })).toHaveCount(0);
});

test('RF-006 the run page offers Resume again when the resumed run is stopped', async ({
  page,
}) => {
  await openHistory(page);
  await runRow(page, '-understand')
    .getByRole('link', { name: /^View run /u })
    .click();
  await openRunTab(page, 'All agents');
  await expect(agentPanel(page, 'Controllers')).toContainText('Running', { timeout: 30_000 });
  await page.getByRole('button', { name: 'Stop run' }).click();
  await expect(runStatus(page)).toContainText('Interrupted', { timeout: 30_000 });

  await expect(page.getByRole('button', { name: 'Resume run' })).toBeEnabled();
  await transitionsDone(page);
  await expectNoSeriousViolations(page);
});
