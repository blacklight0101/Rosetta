import { expect, test } from './support/fixtures.js';
import { repositories } from './support/journey-pages.js';
import { openStartOf } from './support/live-run-page.js';
import { accountFor } from './support/seed.js';
import { signInThroughPage } from './support/sign-in-page.js';

// RF-010, P1-155: the create of a project is answered after a moment. The helper that opens the start
// page of a project waits for the answer where it was made; a reload of the list during the create
// (what P1-150 removed) cancels the request and the project is never made, so this test fails with
// that reload. The answer is held here so that the reload always comes first.

const heldAnswerMs = 1500;

test('RF-010 a project create answered after a moment still ends on the start page of the new project', async ({
  page,
}, info) => {
  test.setTimeout(90_000);
  await signInThroughPage(page, accountFor('start-run', info.project.name));
  await expect(page).toHaveURL(/\/projects$/u);
  await page.route('**/api/projects', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    await new Promise((resolve) => setTimeout(resolve, heldAnswerMs));
    return route.continue().catch(() => undefined);
  });

  await openStartOf(page, repositories.ledger);

  await expect(page.getByRole('heading', { name: 'Start a run', level: 1 })).toBeVisible();
  await expect(page.getByLabel('GitHub repository URL')).toHaveValue(repositories.ledger);
});
