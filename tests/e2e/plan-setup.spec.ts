import { expectNoSeriousViolations } from './support/axe.js';
import { expect, test } from './support/fixtures.js';
import { openStartPage } from './support/live-run-page.js';
import {
  estimate,
  openPlanSetup,
  openStep,
  recorded,
  stepPill,
  understandCatalog,
  writeButton,
} from './support/plan-setup-page.js';
import { accountFor } from './support/seed.js';
import { leaveAPackage } from './support/seed-plan.js';
import { signInAs } from './support/sign-in.js';

// RF-605, RF-606, RF-608, RF-609, RF-610, RF-611, RF-612, RF-613, DEC-72, DEC-86: the Plan setup page,
// driven by the real test server and its fake provider. The `plan` account of the project makes
// `octo/webforms`, understands its Catalog area (the recorded run of serve.ts) and then answers the
// interview; the planner proposes the options of the recording plan-options.json. The steps run in
// order because they share the project, its run and the brief.

test.describe.configure({ mode: 'serial' });

let account = '';

test.beforeEach(async ({ context }, info) => {
  const credentials = accountFor('plan', info.project.name);
  account = credentials.userName;
  await signInAs(context, credentials);
});

test('RF-605 after an understand run Plan setup asks six groups of questions, each with a default and a reason', async ({
  page,
}) => {
  // A scan, then an understand run: longer than the default 30 s.
  test.setTimeout(180_000);
  await understandCatalog(page);
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

  const recommended = page.getByRole('radio', { name: /\(Recommended\)$/u });
  await expect(recommended).toBeVisible({ timeout: 20_000 });
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
  await expect(layers.first().getByRole('radio')).toHaveCount(2, { timeout: 20_000 });
  await expect(page.getByLabel('Your own for Hosting')).toBeVisible();
  await layers.nth(3).getByRole('radio').last().check();
  await expectNoSeriousViolations(page);
});

test('RF-605 RF-610 RF-611 RF-612 the answers are saved as a brief that shows in What I recorded and can be edited', async ({
  page,
}) => {
  await openStartPage(page);
  await openPlanSetup(page);
  await openStep(page, 'Migration');
  await page.getByRole('radio', { name: /^Parallel Change/u }).check();
  await page.getByRole('button', { name: 'Save and continue' }).click();
  await expect(stepPill(page, 'Stack')).toHaveAttribute('aria-current', 'step');
  await page.getByLabel('Your own for Hosting').fill('On-premises Kubernetes');
  await page.getByRole('button', { name: 'Save and continue' }).click();
  await page.getByLabel('Team size').fill('6');
  await page.getByRole('button', { name: 'Save and continue' }).click();
  await page.getByRole('checkbox', { name: /AI agents/u }).check();

  await page.getByRole('button', { name: 'Save', exact: true }).click();

  await expect(recorded(page)).toContainText('Parallel Change');
  await expect(recorded(page)).toContainText('1 of 7 layers: On-premises Kubernetes');
  await expect(recorded(page)).toContainText('1 of 5 answered');
  await expect(recorded(page)).toContainText('with AI-assisted build');
  await expect(recorded(page).getByText('(default)').first()).toBeVisible();
  await page.reload();
  await expect(recorded(page)).toContainText('Parallel Change');
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

  await expect(estimate(page)).toContainText(/\$[\d.]+ likely/u);
  await expect(estimate(page)).toContainText('Run cost cap');
  await expect(writeButton(page)).toBeEnabled();
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
  await expect(writeButton(page)).toHaveText('Write the package again');
  await expectNoSeriousViolations(page);
});

test('RF-604 Write the package starts the plan run and opens its live page', async ({ page }) => {
  await openStartPage(page);
  await openPlanSetup(page);

  await writeButton(page).click();

  await expect(page.getByRole('heading', { name: 'Live run', level: 1 })).toBeVisible();
  await expect(page).toHaveURL(/\/runs\/[0-9a-f-]{36}$/u);
});
