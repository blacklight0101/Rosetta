import type { Page } from '@playwright/test';
import { expectNoSeriousViolations } from './support/axe.js';
import { expect, test } from './support/fixtures.js';
import { openHistory, runRow } from './support/history-page.js';
import { openStartPage, runStatus } from './support/live-run-page.js';
import {
  estimate,
  expectOptions,
  expectPlanCompleted,
  holdPlanOptions,
  openPlanSetup,
  openStep,
  recorded,
  saveBrief,
  stepPill,
  understandCatalog,
  writeButton,
} from './support/plan-setup-page.js';
import { accountFor } from './support/seed.js';
import { leaveAPackage } from './support/seed-plan.js';
import { seededQuestions, seedThreeOpenQuestions } from './support/seed-questions.js';
import { signInAs } from './support/sign-in.js';

// RF-605, RF-606, RF-608, RF-609, RF-610, RF-611, RF-612, RF-613, DEC-72, DEC-86: the Plan setup page,
// driven by the real test server and its fake provider. The `plan` account of the project makes
// `octo/webforms`, understands its Catalog area (the recorded run of serve.ts) and then answers the
// interview; the planner proposes the options of the recording plan-options.json. The steps run in
// order because they share the project, its run and the brief.

test.describe.configure({ mode: 'serial' });

let account = '';
/** The UUID of the understand run of the first test, which the one-click test gives its questions. */
let understandRun = '';

test.beforeEach(async ({ context }, info) => {
  const credentials = accountFor('plan', info.project.name);
  account = credentials.userName;
  await signInAs(context, credentials);
});

async function answerHosting(page: Page, text: string): Promise<void> {
  const hosting = page.getByRole('radiogroup', { name: 'Hosting' });
  await hosting.getByRole('radio', { name: 'Type your own answer' }).check();
  await page.getByLabel('Your answer for Hosting').fill(text);
}

test('RF-605 after an understand run Plan setup asks six groups of questions, each with a default and a reason', async ({
  page,
}) => {
  // A scan, then an understand run: longer than the default 30 s.
  test.setTimeout(180_000);
  await understandCatalog(page);
  understandRun = new URL(page.url()).pathname.split('/').at(-1) ?? '';
  await openStartPage(page);

  await openPlanSetup(page);

  const steps = page.getByRole('navigation', { name: 'Steps' }).getByRole('button');
  await expect(steps).toHaveText([
    'Principles',
    'Architecture',
    'Migration',
    'Stack',
    'Project context',
    'Build method',
  ]);
  await expect(stepPill(page, 'Principles')).toHaveAttribute('aria-current', 'step');
  await expect(page.getByText(/Each one you keep becomes rules/u)).toBeVisible();
  await expect(page.getByText(/^Default: the \d+ recommended principles are on\.$/u)).toBeVisible();
  await expect(page.getByRole('checkbox', { name: /^SOLID \(Recommended\)/u })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: /^Design patterns/u })).not.toBeChecked();
  await expectNoSeriousViolations(page);
});

test('RF-608 the architecture step proposes two styles from the code with their evidence and marks one (Recommended)', async ({
  page,
}) => {
  await openStartPage(page);
  await openPlanSetup(page);

  await openStep(page, 'Architecture');

  const recommended = await expectOptions(page);
  await expect(recommended).toBeChecked();
  await expect(page.locator('.rst-plan-evidence .rst-chip').first()).toBeVisible();
  await expect(page.getByRole('group', { name: /^Other styles \(\d+\)$/u })).toBeVisible();
  await expectNoSeriousViolations(page);
});

test('RF-609 the stack step has two options for each of the seven layers and a field of your own', async ({
  page,
}) => {
  await openStartPage(page);
  await openPlanSetup(page);

  await openStep(page, 'Stack');

  const layers = page.getByRole('radiogroup');
  await expect(layers).toHaveCount(7);
  // DEC-203: the demo is .NET Framework (end of life), so its language layer does not offer keeping it;
  // the database layer is not end of life and still has the two proposals, keep and your own.
  await expect(layers.first().getByRole('radio')).toHaveCount(3, { timeout: 20_000 });
  await expect(layers.nth(3).getByRole('radio')).toHaveCount(4);
  await expect(
    page
      .getByRole('radiogroup', { name: 'Hosting' })
      .getByRole('radio', { name: 'Type your own answer' }),
  ).toBeVisible();
  await layers.nth(3).getByRole('radio').last().check();
  await expectNoSeriousViolations(page);
});

test('RF-605 RF-610 RF-611 RF-612 the answers are saved as a brief that shows in What I recorded and can be edited', async ({
  page,
}) => {
  // #1183: hold the planner's options so saving records only the typed layer, not every open one.
  const release = await holdPlanOptions(page);
  await openStartPage(page);
  await openPlanSetup(page);
  await openStep(page, 'Migration');
  await page.getByRole('radio', { name: /^Parallel Change/u }).check();
  await page.getByRole('button', { name: 'Save and continue' }).click();
  await expect(stepPill(page, 'Stack')).toHaveAttribute('aria-current', 'step');
  await answerHosting(page, 'On-premises Kubernetes');
  await page.getByRole('button', { name: 'Save and continue' }).click();
  await page.getByLabel('Team size', { exact: true }).fill('6');
  // P6-26 (RF-611, DEC-189): the hosted question has no recommended answer and works by keyboard.
  const hosting = page.getByRole('radiogroup', { name: 'Will the new application be hosted?' });
  await expect(hosting.getByRole('radio', { checked: true })).toHaveCount(0);
  await expect(hosting).not.toContainText('Recommended');
  await hosting.getByRole('radio', { name: 'Hosted', exact: true }).focus();
  await page.keyboard.press('Space');
  await expectNoSeriousViolations(page);
  await page.getByRole('button', { name: 'Save and continue' }).click();
  await page.getByRole('radio', { name: /^Agents will build/u }).check();
  await page.getByRole('radio', { name: /^Claude Code/u }).check();

  await saveBrief(page, page.getByRole('button', { name: 'Save', exact: true }));
  release();

  await expect(recorded(page)).toContainText('Parallel Change');
  await expect(recorded(page)).toContainText('1 of 7 layers: On-premises Kubernetes');
  await expect(recorded(page)).toContainText('1 of 5 answered; the new application will be hosted');
  await expect(recorded(page)).toContainText(
    'Agents will build with Claude Code. Models: smallest haiku, middle sonnet, largest opus',
  );
  await expect(recorded(page).getByText('(default)').first()).toBeVisible();
  // P8-107: the held request was let through, so the options reach the page that asked for them.
  await openStep(page, 'Architecture');
  await expectOptions(page);
  await page.reload();
  await expect(recorded(page)).toContainText('Parallel Change');
  await expect(recorded(page)).toContainText('will be hosted');
  await openStep(page, 'Migration');
  await page.getByRole('radio', { name: /^Strangler Fig/u }).check();
  await page.getByRole('button', { name: 'Save and continue' }).click();
  await expect(recorded(page)).toContainText('Strangler Fig');
  await expectNoSeriousViolations(page);
});

test('RF-613 the plan estimate shows the planner against the caps and the package can be written', async ({
  page,
}) => {
  await openStartPage(page);

  await openPlanSetup(page);

  await expect(estimate(page)).toContainText(/(\$[\d.]+|[\d,]+ tokens) likely/u);
  // P8-01: Analyse recorded the journey, so the run's line is what is left of its amount.
  await expect(estimate(page)).toContainText('Approved tokens left');
  await expect(writeButton(page)).toBeEnabled();
  await expectNoSeriousViolations(page);
});

test('RF-605 P8-82 the estimate and Start the plan stay in view at the top and the bottom of the page', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openStartPage(page);

  await openPlanSetup(page);

  await expect(page.getByRole('region', { name: 'Roles' })).toContainText('Planner');
  const bar = page.getByRole('region', { name: 'Plan summary' });
  await expect(bar).toContainText(/Plan estimate: likely (\$[\d.]+|[\d,]+ tokens)/u);
  for (const top of [0, 1_000_000]) {
    await page.evaluate(`window.scrollTo(0, ${String(top)})`);
    await expect(bar).toBeInViewport({ ratio: 1 });
    await expect(bar.getByRole('button', { name: /^Start the plan/u })).toBeInViewport();
  }
  await expectNoSeriousViolations(page);
});

test('RF-435 RF-432 P8-01 the plan estimate says the plan runs under what is left of the journey amount, not the project run caps', async ({
  page,
}) => {
  await openStartPage(page);

  await openPlanSetup(page);

  // Analyse recorded the journey, so the plan run's line is its remainder and it pauses there.
  await expect(page.getByTestId('plan-run-line')).toHaveText(
    /under what is left of the amount you approved for the journey, not under the project run caps: it pauses and asks/u,
  );
  await expect(estimate(page)).toContainText(/Approved (amount|tokens) left/u);
  await expect(estimate(page)).not.toContainText(/\bfits\b/u);
});

test('RF-647 one click accepts the recommended answers and the plan waits for Start the plan', async ({
  page,
}) => {
  expect(understandRun).not.toBe('');
  await openStartPage(page);
  // P8-16: the recorded run asks nothing, so the run gets the three open questions of the case.
  await seedThreeOpenQuestions(page, understandRun);
  await openStartPage(page);
  await openPlanSetup(page);
  const screen = page.getByRole('region', { name: 'Questions and plan setup' });
  await expect(screen).toBeVisible();
  const questions = screen.getByTestId('open-question');
  await expect(questions).toHaveCount(seededQuestions.length);

  const saved = page.waitForResponse(
    (response) =>
      response.request().method() === 'PUT' && response.url().endsWith('/planning-brief'),
  );
  const answered: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'PUT' && request.url().endsWith('/answers')) {
      answered.push(request.postData() ?? '');
    }
  });
  await screen.getByRole('button', { name: 'Accept the recommended answers' }).click();
  expect((await saved).ok()).toBe(true);

  // One click answered all three questions, each on its recommended option.
  expect(answered).toHaveLength(seededQuestions.length);
  for (const [index, body] of answered.entries()) {
    expect(body).toContain(`OQ-00${String(index + 1)}`);
    expect(body).toContain('"chosen":1');
  }

  await expect(estimate(page)).toContainText(/(\$[\d.]+|[\d,]+ tokens) likely/u);
  await expect(writeButton(page)).toBeEnabled();
  await expect(page).toHaveURL(/\/plan-setup/u);
  await expectNoSeriousViolations(page);
});

test('RF-605 after a package exists a changed answer says the package is out of date and offers to write it again', async ({
  page,
}) => {
  await leaveAPackage(account);
  await openStartPage(page);
  await openPlanSetup(page);
  await page.getByRole('checkbox', { name: /^Design patterns/u }).check();
  await page.getByRole('button', { name: 'Save and continue' }).click();

  await expect(page.getByText(/The package is out of date/u)).toBeVisible();
  await expect(writeButton(page)).toHaveText('Start the plan again');
  await expectNoSeriousViolations(page);
});

test('RF-604 Start the plan starts the plan run and opens its live page', async ({ page }) => {
  test.setTimeout(120_000); // The plan run may wait for a run slot (RF-1108).
  await openStartPage(page);
  await openPlanSetup(page);

  await writeButton(page).click();

  // The next test starts a plan of the same project: this one has to end first (RF-435, P8-03).
  await expectPlanCompleted(page);
});

test('RF-614 RF-604 from the completed understand run to the package: Set up the plan opens Plan setup for that run', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await openHistory(page);
  await runRow(page, '-understand')
    .first()
    .getByRole('link', { name: /^View run /u })
    .click();
  const turn = page.getByRole('region', { name: 'Your turn' });
  const setUp = turn.getByRole('button', { name: /^(Skip the Deepen and s|S)et up the plan$/u }); // P8-84
  await expect(setUp).toBeVisible();
  await expectNoSeriousViolations(page);
  await setUp.click();

  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}\/plan-setup\?run=[0-9a-f-]{36}$/u);
  const source = page.getByRole('region', { name: 'Source run' });
  await expect(source).toContainText('-understand');
  await expect(source).toContainText(/\d+ Supported claims?/u);
  await expect(estimate(page)).toContainText(/(\$[\d.]+|[\d,]+ tokens) likely/u);
  await expect(writeButton(page)).toBeEnabled();
  await expectNoSeriousViolations(page);
  await writeButton(page).click();
  await expect(runStatus(page)).toContainText('Completed', { timeout: 90_000 });
  await expect(page.getByRole('link', { name: 'Download hand-off zip' })).toBeVisible();
});
