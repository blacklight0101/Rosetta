import { expectNoSeriousViolations } from './support/axe.js';
import { expect, test } from './support/fixtures.js';
import { openStartPage } from './support/live-run-page.js';
import { openPlanSetup, openStep, recorded, understandCatalog } from './support/plan-setup-page.js';
import { accountFor } from './support/seed.js';
import { signInAs } from './support/sign-in.js';

// RF-645, RF-605, DEC-178: a typed answer is saved in the brief and shown in "What I recorded". The
// spec has a file of its own and depends on no state saved by another spec.

test.beforeEach(async ({ context }, info) => {
  await signInAs(context, accountFor('plan', info.project.name));
});

test('RF-645 RF-605 a typed answer to the migration question is saved and shown in What I recorded', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await understandCatalog(page);
  await openStartPage(page);
  await openPlanSetup(page);
  await openStep(page, 'Migration');
  await expect(page.getByRole('radio', { name: /^Strangler Fig \(Recommended\)/u })).toBeVisible();
  await page.getByRole('radio', { name: /^Type your own answer/u }).check();
  await page.getByLabel('Your own answer').fill('Move one module a week.');
  await expectNoSeriousViolations(page);
  await page.getByRole('button', { name: 'Save and continue' }).click();
  await expect(recorded(page)).toContainText('Your own answer: Move one module a week.');

  await page.reload();
  await openStep(page, 'Migration');
  await expect(page.getByRole('radio', { name: /^Type your own answer/u })).toBeChecked();
  await expect(page.getByLabel('Your own answer')).toHaveValue('Move one module a week.');
});
