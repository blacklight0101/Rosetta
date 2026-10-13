import { expect, test } from '../support/fixtures.js';
import { expectNoSeriousViolations } from '../support/axe.js';
import { transitionsDone } from '../support/transitions.js';
import { accountFor } from '../support/seed.js';
import { submitSignIn } from '../support/sign-in-page.js';

// RF-1200, RF-1100, RF-1101, RNF-010, P1-46: the journey of a visitor (flow 5): the landing page,
// the Sign in link, a closed door for a page that needs an account, the sign-in form, the
// projects page and Sign out. Everything goes through the pages of the real server.

test('RF-1200 RF-1100 RF-1101 a visitor reads the landing page, signs in, reaches the projects and signs out', async ({
  page,
}, info) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('legacy code');
  await transitionsDone(page);
  await expectNoSeriousViolations(page);

  await page.goto('/projects');
  await expect(page).toHaveURL(/\/sign-in$/u);
  await page.goto('/');
  await page.getByRole('link', { name: 'Sign in to try it' }).click();
  await expect(page).toHaveURL(/\/sign-in$/u);
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  // The pointer is still over the place the link was: its hover state is not the page at rest.
  await page.mouse.move(0, 0);
  await transitionsDone(page);
  await expectNoSeriousViolations(page);

  await submitSignIn(page, accountFor('journey', info.project.name));

  await expect(page).toHaveURL(/\/projects$/u);
  await expect(page.getByRole('heading', { name: 'Projects', level: 1 })).toBeVisible();
  await expect(page.getByText('No projects yet')).toBeVisible();
  await transitionsDone(page);
  await expectNoSeriousViolations(page);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/sign-in$/u);
  await page.goto('/projects');
  await expect(page).toHaveURL(/\/sign-in$/u);
});
