import { expect, test } from './support/fixtures.js';
import { expectNoSeriousViolations } from './support/axe.js';
import { openScannedStartPage } from './support/cost-run.js';
import { accountFor } from './support/seed.js';
import { signInAs } from './support/sign-in.js';

// RF-241, RNF-010: the "Re-run with answers" option of the start page, with answered questions
// waiting. The count answer is replaced; the page, its CSS and the real server are the ones under test.

test.beforeEach(async ({ context }, info) => {
  await signInAs(context, accountFor('start-run', info.project.name));
});

test('RF-241 the Re-run with answers option is reachable by keyboard and has no serious violation', async ({
  page,
}) => {
  await page.route('**/api/projects/*/answered-questions', (route) =>
    route.fulfill({ json: { count: 2 } }),
  );
  await openScannedStartPage(page);

  const option = page.getByRole('checkbox', { name: /Re-run with answers/u });
  await expect(option).toBeVisible();
  await option.focus();
  await page.keyboard.press('Space');
  await expect(option).toBeChecked();
  await expectNoSeriousViolations(page);
});
