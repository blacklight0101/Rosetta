import { expect, test } from './support/fixtures.js';
import { openStartPage } from './support/live-run-page.js';
import {
  openPlanSetup,
  openStep,
  recorded,
  stepPill,
  understandCatalog,
} from './support/plan-setup-page.js';
import { accountFor } from './support/seed.js';
import { signInAs } from './support/sign-in.js';

// RF-609, RF-605, P7-29, #1183: the stack step records every layer once the planner's options have
// arrived, and only the layers answered by hand before that. The spec has a file of its own, so its
// account, project and brief are its own, and it waits for the options instead of racing them.

test.beforeEach(async ({ context }, info) => {
  await signInAs(context, accountFor('plan', info.project.name));
});

test('RF-609 RF-605 P7-29 saving the stack step after the options arrived records all seven layers', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await understandCatalog(page);
  await openStartPage(page);
  await openPlanSetup(page);
  const options = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && response.url().endsWith('/plan-options'),
  );
  await openStep(page, 'Stack');
  // The planner's options are asked for when the step opens and answer after a moment.
  expect((await options).ok()).toBe(true);
  const hosting = page.getByRole('radiogroup', { name: 'Hosting' });
  await hosting.getByRole('radio', { name: 'Type your own answer' }).check();
  await page.getByLabel('Your answer for Hosting').fill('On-premises Kubernetes');

  const saved = page.waitForResponse(
    (response) =>
      response.request().method() === 'PUT' && response.url().endsWith('/planning-brief'),
  );
  await page.getByRole('button', { name: 'Save and continue' }).click();
  expect((await saved).ok()).toBe(true);

  await expect(stepPill(page, 'Project context')).toHaveAttribute('aria-current', 'step');
  await expect(recorded(page)).toContainText('7 of 7 layers');
  await expect(recorded(page)).toContainText('On-premises Kubernetes');
});
