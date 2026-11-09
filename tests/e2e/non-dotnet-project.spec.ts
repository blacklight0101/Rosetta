import { expect, test } from './support/fixtures.js';
import { openStartOf } from './support/live-run-page.js';
import { accountFor } from './support/seed.js';
import { signInAs } from './support/sign-in.js';

// RF-609, DEC-208, ADR-008 (P8-103): the end-to-end seed holds a small project that is not .NET,
// `octo/inventory` (serve.ts, the Python fixture), scanned like the .NET demo, and the account
// `plan-non-dotnet` for the walks that need it. The spec has a file of its own.

test('RF-609 DEC-208 the seeded Python project opens, is scanned and shows its own areas', async ({
  page,
  context,
}, info) => {
  test.setTimeout(120_000);
  await signInAs(context, accountFor('plan-non-dotnet', info.project.name));
  await page.goto('/projects');

  await openStartOf(page, 'https://github.com/octo/inventory');

  // RF-160: the scan starts by itself; the areas of the code map appear when it ends.
  const areas = page.getByRole('group', { name: 'Areas from the code map' }).locator('label');
  await expect(areas.first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('button', { name: /^Analyse/u })).toBeVisible({ timeout: 15_000 });
  const labels = (await areas.allTextContents()).map((label) => label.trim());
  expect(labels).toContain('inventory');
  expect(labels).not.toContain('Catalog');
});
