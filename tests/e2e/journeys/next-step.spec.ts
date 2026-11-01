import { expect, test } from '../support/fixtures.js';
import { saveBrief, understandFromUrl, writeAndDownload } from '../support/handoff-journey.js';
import { openProjectStart, repositories } from '../support/journey-pages.js';
import { accountFor } from '../support/seed.js';
import { signInThroughPage } from '../support/sign-in-page.js';

// RF-1020, RF-1021, RF-209, DEC-204: from a finished understand run to a downloaded package, the
// project page shows the journey strip with History and the project settings one click away, and the
// next step is offered where the user is: Plan setup from the strip, then the plan from Plan setup.

test('RF-1020 RF-1021 from a finished understand to a downloaded package the strip offers each next step', async ({
  page,
}, info) => {
  test.setTimeout(300_000);
  await signInThroughPage(page, accountFor('journey-run', `${info.project.name}/next-step`));
  await understandFromUrl(page);

  await openProjectStart(page, repositories.webforms);
  const strip = page.getByRole('region', { name: 'Journey from code to package' });
  await expect(strip).toBeVisible();
  await expect(strip.getByRole('link', { name: 'History' })).toBeVisible();
  await expect(strip.getByRole('link', { name: 'Project settings' })).toBeVisible();
  await expect(
    strip.locator('li[data-state="done"]').filter({ hasText: 'Understand' }),
  ).toBeVisible();

  await page.getByRole('navigation').getByRole('link', { name: 'Plan setup' }).click();
  await saveBrief(page);
  const files = await writeAndDownload(page);
  expect(Object.keys(files).length).toBeGreaterThan(0);

  await openProjectStart(page, repositories.webforms);
  await expect(strip.getByRole('button', { name: 'Open the package' })).toBeVisible();
});
