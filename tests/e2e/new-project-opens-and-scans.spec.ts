import { expect, test } from './support/fixtures.js';
import { accountFor } from './support/seed.js';
import { signInThroughPage } from './support/sign-in-page.js';
import { fixtureZip, uploadFromNewProject } from './support/zip-journey.js';

// RF-010, RF-160, EV-87, EV-88, P8-10: a zip made on the Projects page opens the project page by
// itself and the free scan starts there, so the file and one click end in the estimate; the page
// load makes no request that fails with 404 (the batch state of a project with no batch is 200).

test('RF-160 EV-87 EV-88 an uploaded zip opens its page, scans without another click and logs no 404', async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  const failed: string[] = [];
  page.on('response', (response) => {
    if (response.status() === 404 && response.url().includes('/api/')) failed.push(response.url());
  });
  await signInThroughPage(page, accountFor('journey-run', info.project.name));
  await expect(page).toHaveURL(/\/projects$/u);

  await uploadFromNewProject(page, 'NewOrders.zip', await fixtureZip());

  await expect(page).toHaveURL(/\/projects\/[^/]+$/u);
  await expect(page.getByRole('button', { name: /^Analyse/u })).toBeVisible({ timeout: 60_000 });
  expect(failed).toEqual([]);
});
