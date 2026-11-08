import { expect, test } from './support/fixtures.js';
import { openStartPage } from './support/live-run-page.js';
import {
  expectOptions,
  holdPlanOptions,
  openPlanSetup,
  openStep,
  recorded,
  saveBrief,
  stepPill,
  understandCatalog,
} from './support/plan-setup-page.js';
import { accountFor } from './support/seed.js';
import { signInAs } from './support/sign-in.js';

// RF-609, RF-605, P7-29, #1183: the stack step records every layer once the planner's options have
// arrived, and only the layers answered by hand before that. The spec has a file of its own, so its
// account, project and brief are its own, and it waits for the options instead of racing them.

// The two cases share the project and its brief, so they run in this order: the held case saves one
// layer, then the other records the seven.
test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ context }, info) => {
  await signInAs(context, accountFor('plan', info.project.name));
});

test('RF-609 RF-605 #1202 saving while the options are held records only the typed layer, and the options released after it do not fill the rest', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await understandCatalog(page);
  await openStartPage(page);
  await openPlanSetup(page);
  const release = await holdPlanOptions(page);
  const asked = page.waitForRequest(
    (request) => request.method() === 'POST' && request.url().endsWith('/plan-options'),
  );
  await openStep(page, 'Stack');
  await asked;
  await page
    .getByRole('radiogroup', { name: 'Hosting' })
    .getByRole('radio', { name: 'Type your own answer' })
    .check();
  await page.getByLabel('Your answer for Hosting').fill('On-premises Kubernetes');

  await saveBrief(page, page.getByRole('button', { name: 'Save and continue' }));
  await expect(stepPill(page, 'Project context')).toHaveAttribute('aria-current', 'step');

  // Released after the save: the options arrive late and the page shows them, the brief is unchanged.
  const arrived = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && response.url().endsWith('/plan-options'),
  );
  release();
  expect((await arrived).ok()).toBe(true);
  await openStep(page, 'Architecture');
  await expectOptions(page);
  await expect(recorded(page)).toContainText('1 of 7 layers: On-premises Kubernetes');
  await expect(recorded(page)).not.toContainText('7 of 7 layers');
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

  await saveBrief(page, page.getByRole('button', { name: 'Save and continue' }));

  await expect(stepPill(page, 'Project context')).toHaveAttribute('aria-current', 'step');
  await expect(recorded(page)).toContainText('7 of 7 layers');
  await expect(recorded(page)).toContainText('On-premises Kubernetes');
});
