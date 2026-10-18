import { expect, test } from '../support/fixtures.js';
import { expectNoSeriousViolations } from '../support/axe.js';
import { openHistory, runRow } from '../support/history-page.js';
import {
  downloadedRunFiles,
  scanAndChooseModels,
  understandEveryArea,
} from '../support/full-run-pages.js';
import { answerToOq001, fullRunModel } from '../support/journey-models.js';
import {
  agentPanel,
  openRunTab,
  runStatus,
  startAndOpenLiveRun,
  valueOf,
} from '../support/live-run-page.js';
import { accountFor } from '../support/seed.js';
import { signInThroughPage } from '../support/sign-in-page.js';
import { transitionsDone } from '../support/transitions.js';
import { inEveryView } from '../support/views.js';

// RF-006 is not here (cap-resume.spec.ts). RF-301, RF-300, RF-240, RF-241, RF-1007, ADR-010,
// P2-13: flows 2 and 3 end to end through the pages and the real server. The first journey
// understands every area of the C# fixture and checks that both steps of the verifier ran: the
// citation check (two claims have an invalid citation) and the model judgement (four Supported, one
// Rejected with its reason). The second answers the question the run asked and runs the area again
// with the answers. The model double replays the recorded runs (e2e-provider.ts); the reader model
// has another name than the default, so no area is held.

const claim = (page: Parameters<typeof agentPanel>[0], id: string) =>
  page.getByRole('region', { name: 'Claims' }).getByTestId('claim').filter({ hasText: id });

test.describe.configure({ mode: 'serial' });

test('RF-300 RF-301 every area is understood and every claim gets both verifier steps', async ({
  page,
}, info) => {
  test.setTimeout(240_000);
  await signInThroughPage(page, accountFor('journey-run', info.project.name));
  await expect(page).toHaveURL(new RegExp('/projects$', 'u'));
  await scanAndChooseModels(page, { reader: fullRunModel });

  await understandEveryArea(page);

  await transitionsDone(page);
  await expectNoSeriousViolations(page);
  await expect(page.getByText('5 of 5 agents done')).toBeVisible();
  await expect(page.getByText('7 of 7 citations checked, 5 judged').first()).toBeVisible();
  await openRunTab(page, 'Evidence');
  const overview = page.getByRole('region', { name: 'Overview', exact: true });
  await expect(valueOf(overview, 'Done')).toHaveText('5');
  await expect(valueOf(overview, 'Failed')).toHaveText('0');
  await expect(agentPanel(page, 'Controllers')).toContainText('Done');
  await expect(claim(page, 'BR-001.c2')).toContainText('Citation invalid');
  await expect(claim(page, 'BR-001.c3')).toContainText('Citation invalid');
  await expect(claim(page, 'FEAT-001.c1')).toContainText('Supported');
  await expect(claim(page, 'ENT-001.c1')).toContainText('Supported');
  await expect(claim(page, 'BR-002.c1')).toContainText('Rejected');
  await expect(claim(page, 'BR-002.c1')).toContainText('nothing in the lines runs it');
  await expect(page.getByText('Waiting for judgement')).toHaveCount(0);
  await expect(page.getByText('Unverified')).toHaveCount(0);
  await expect(page.getByText('2 citation invalid · 4 supported · 1 rejected')).toBeVisible();
});

test('RF-240 RF-241 RF-1007 the owner answers the open question and the area runs again with the answer', async ({
  page,
}, info) => {
  test.setTimeout(240_000);
  await signInThroughPage(page, accountFor('journey-run', info.project.name));
  await expect(page).toHaveURL(/\/projects$/u);
  await openHistory(page);
  await runRow(page, '-understand')
    .getByRole('link', { name: /^View run /u })
    .click();
  await openRunTab(page, 'Your questions');
  const question = page
    .getByRole('region', { name: 'Open questions' })
    .getByTestId('open-question')
    .filter({ hasText: 'OQ-001' });
  await expect(question).toContainText('Open');
  await question.getByLabel('Answer to OQ-001').fill(answerToOq001);
  await question.getByRole('button', { name: 'Save answer' }).click();
  await expect(question).toContainText('Answer saved in answers.md.');

  await page.getByRole('link', { name: 'Start page' }).click();
  const rerun = page.getByRole('checkbox', { name: 'Re-run with answers', exact: false });
  await rerun.check();
  await startAndOpenLiveRun(page);

  await expect(runStatus(page)).toContainText('Completed', { timeout: 120_000 });
  await expect(page.getByText('1 of 1 agents done')).toBeVisible();
  await openRunTab(page, 'Evidence');
  await expect(agentPanel(page, '(root)')).toContainText('Done');
  await expect(claim(page, 'BR-001.c1')).toContainText('Supported');
  await expect(claim(page, 'FEAT-001.c1')).toContainText('as the owner confirmed');
  const files = await downloadedRunFiles(page);
  const spec = files['spec.md'] ?? '';
  expect(spec).toContain('## New cards\n\n- BR-001 Items with zero stock stay listed');
  expect(spec).toContain('## Changed cards\n\n- FEAT-001 Home page lists the catalog');

  // The question of the first run is now marked Answered, because a re-run used its answer.
  await openHistory(page);
  await runRow(page, '-understand')
    .getByRole('link', { name: /^View run /u })
    .last()
    .click();
  await openRunTab(page, 'Your questions');
  await expect(question).toContainText('Answered');
});

test('RF-209 RF-231 the run shows its measures and offers Deepen with an estimate that starts nothing', async ({
  page,
}, info) => {
  test.setTimeout(240_000);
  await signInThroughPage(page, accountFor('journey-run', info.project.name));
  await expect(page).toHaveURL(/\/projects$/u);
  await openHistory(page);
  await runRow(page, '-understand')
    .getByRole('link', { name: /^View run /u })
    .last()
    .click();
  const measures = page.getByRole('region', { name: 'Understanding measures' });
  await expect(measures.getByTestId('measure-coverage')).toContainText('First-party coverage');
  await expect(measures.getByTestId('understanding-standing')).toBeVisible();
  await expect(measures).not.toContainText(/complete|fully understood/iu);

  const started: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().endsWith('/deepen')) {
      started.push(request.url());
    }
  });
  const turn = page.getByRole('region', { name: 'Your turn' });
  await turn.getByRole('button', { name: 'Deepen this run' }).click();
  await expect(turn.getByTestId('deepen-first-round')).toBeVisible();
  await expect(turn.getByTestId('deepen-all-rounds')).toContainText(
    'a working ceiling, not a maximum',
  );
  await expect(turn.getByTestId('deepen-all-rounds')).toContainText('is what stops the run');

  await transitionsDone(page);
  await expectNoSeriousViolations(page);
  await inEveryView(page, info, async () => {
    const fits = await page.evaluate(
      'document.documentElement.scrollWidth <= document.documentElement.clientWidth',
    );
    expect(fits).toBe(true);
  });
  expect(started).toEqual([]);
});
