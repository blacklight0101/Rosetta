import { expect, test } from '@playwright/test';
import { chosenCredentials, projectsOf, rememberedRun, runEventTypes } from './stack.js';

// RF-1301, P1-45: after `docker compose down` and `up` (no -v) the accounts, projects and runs are
// still there. The account signs in on the sign-in page with the password it chose before the
// restart, the project created before the restart is listed, and the events of its scan run replay
// from storage.

test('RF-1301 the account, the project and the run survive a restart of the stack', async ({
  page,
}) => {
  const { userName, password } = chosenCredentials();
  await page.goto('/sign-in');
  await page.getByLabel('User name').fill(userName);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page).toHaveURL(/\/projects$/u);
  await expect(page.getByRole('row').filter({ hasText: 'octo/demo' })).toBeVisible();
  expect((await projectsOf(page)).map((project) => project.name)).toEqual(['octo/demo']);
  const types = await runEventTypes(page, await rememberedRun());
  expect(types.at(-1)).toBe('run.ended');
});
