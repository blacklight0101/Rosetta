import type { Locator, Page, TestInfo } from '@playwright/test';
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
  openQuestion,
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

const journeyOf = (page: Page) =>
  page.getByRole('region', { name: 'Journey from code to package' });

/** DEC-154: with a question open, the journey offers the defaults, which open the brief. */
async function goOnWithTheDefaultsAndBack(page: Page): Promise<void> {
  await journeyOf(page).getByRole('button', { name: 'Go on with the defaults' }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}\/plan-setup\?run=[0-9a-f-]{36}$/u);
  await page.goBack();
}

/**
 * RF-646, DEC-179: a run that can be deepened asks nothing yet: Your turn recommends Deepen first and
 * says that answers given now will be used by it, and the journey recommends it too. Choosing not to
 * Deepen asks for the answers at once.
 */
async function chooseNotToDeepen(page: Page): Promise<void> {
  const turn = page.getByRole('region', { name: 'Your turn' });
  await expect(turn.getByTestId('deepen-first')).toContainText('Deepen this run first');
  await expect(turn.getByTestId('deepen-first')).toContainText('uses the answers given before it');
  await expect(
    journeyOf(page).getByRole('button', { name: 'Deepen this run first' }),
  ).toBeVisible();
  await expect(turn.getByRole('button', { name: /^Answer / })).toHaveCount(0);
  await turn.getByRole('button', { name: 'Do not Deepen: answer the questions now' }).click();
  await expect(turn.getByTestId('deepen-first')).toHaveCount(0);
}

/** DEC-154, RNF-010: both actions of the journey fit and pass axe at 360 px, light and dark. */
async function expectActionsFit(page: Page, info: TestInfo): Promise<void> {
  await transitionsDone(page);
  await inEveryView(page, info, async () => {
    await expect(
      journeyOf(page).getByRole('button', { name: 'Go on with the defaults' }),
    ).toBeVisible();
    const fits = await page.evaluate(
      'document.documentElement.scrollWidth <= document.documentElement.clientWidth',
    );
    expect(fits).toBe(true);
    await expectNoSeriousViolations(page);
  });
}

/** DEC-154: the saved answer moves the journey on to the brief, with no reload of the page. */
async function expectJourneyMovedOn(page: Page, question: Locator): Promise<void> {
  const journey = journeyOf(page);
  await expect(question.getByTestId('status-badge')).toHaveText('Answer saved');
  await expect(journey.getByRole('button', { name: 'Set up the plan' })).toBeVisible();
  await expect(journey.getByRole('button', { name: /^Answer / })).toHaveCount(0);
  await expect(journey.getByRole('button', { name: 'Go on with the defaults' })).toHaveCount(0);
}

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
  await chooseNotToDeepen(page);
  await goOnWithTheDefaultsAndBack(page);
  const question = openQuestion(page, 'OQ-001');
  await journeyOf(page).getByRole('button', { name: 'Answer 1 question' }).click();
  // RF-645: the question offers its suggested answers; the first option takes the focus.
  await expect(question.getByRole('radio').first()).toBeFocused();
  await expectActionsFit(page, info);
  await expect(question).toContainText('Open');
  await question.getByRole('radio', { name: 'Type your own answer' }).check();
  await question.getByLabel('Answer to OQ-001').fill(answerToOq001);
  await question.getByRole('button', { name: 'Save answer' }).click();
  await expect(question).toContainText('Answer saved in answers.md.');
  await expectJourneyMovedOn(page, question);

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

test('RF-209 RF-231 a confirmed Deepen runs its rounds on the page and shows what it changed', async ({
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
  const parentUrl = page.url();
  const turn = page.getByRole('region', { name: 'Your turn' });
  await turn.getByRole('button', { name: 'Deepen this run' }).click();
  await expect(turn.getByTestId('deepen-first-round')).toBeVisible();
  await turn.getByRole('button', { name: 'Start Deepen' }).click();
  await page
    .getByRole('dialog', { name: 'Start this Deepen?' })
    .getByRole('button', { name: 'Confirm and start' })
    .click();

  await expect(page).not.toHaveURL(parentUrl);
  const progress = page.getByRole('region', { name: 'Deepen progress' });
  await expect(progress).toContainText('Started from');
  // The stop is the last of the Deepen events; the status of the page can lag the new run at first.
  await expect(progress.getByTestId('deepen-progress-stop')).toBeVisible({ timeout: 120_000 });
  await expect(runStatus(page)).toContainText('Completed', { timeout: 30_000 });
  const changes = page.getByRole('table', { name: 'Before and after this Deepen' });
  await expect(changes.getByTestId('change-coverage')).toBeVisible();
  // P3-62: the round lines read in plain words, the log counts from the start and names no micro-dollars.
  await expect(progress).not.toContainText(/(?<!\d)(?:0 unread files|1 files read|1 new claims)/u);
  await openRunTab(page, 'Activity');
  const log = page.getByRole('log', { name: 'Event log' });
  await expect(log.locator('time').first()).toHaveText(/^\+\d\d:\d\d\.\d$/u);
  await expect(log).not.toContainText('micro-dollars');
  await expectNoSeriousViolations(page);

  await transitionsDone(page);
  await expectNoSeriousViolations(page);
  await inEveryView(page, info, async () => {
    const fits = await page.evaluate(
      'document.documentElement.scrollWidth <= document.documentElement.clientWidth',
    );
    expect(fits).toBe(true);
  });
  // A reload shows the same rounds as the live page did.
  const live = (await progress.textContent()) ?? '';
  await page.reload();
  await expect(page.getByRole('region', { name: 'Deepen progress' })).toHaveText(live);
});

test('RF-646 RF-1007 the question answered before the Deepen is listed once after it, in the Answered list', async ({
  page,
}, info) => {
  test.setTimeout(240_000);
  await signInThroughPage(page, accountFor('journey-run', info.project.name));
  await expect(page).toHaveURL(/\/projects$/u);
  await openHistory(page);
  // The newest understand run is the Deepen of the test before.
  await runRow(page, '-understand')
    .getByRole('link', { name: /^View run /u })
    .first()
    .click();

  const turn = page.getByRole('region', { name: 'Your turn' });
  await expect(turn.getByTestId('deepen-first')).toHaveCount(0);
  await openRunTab(page, 'Your questions');
  const region = page.getByRole('region', { name: 'Open questions' });
  // One list: the question answered before the Deepen is there once and is not asked again.
  await expect(region.getByTestId('open-question').filter({ hasText: 'OQ-001' })).toHaveCount(1);
  const answered = region.getByTestId('answered-questions');
  await expect(answered.getByTestId('open-question').filter({ hasText: 'OQ-001' })).toHaveCount(1);
  // The list is collapsed and opens from the keyboard.
  await expect(answered).not.toHaveAttribute('open', '');
  await answered.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(answered).toHaveAttribute('open', '');
  await expect(answered.getByLabel('Answer to OQ-001')).toBeVisible();
  await transitionsDone(page);
  await expectNoSeriousViolations(page);
});
