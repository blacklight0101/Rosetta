import { expect, test } from '../support/fixtures.js';
import { expectNoSeriousViolations } from '../support/axe.js';
import { accountFor } from '../support/seed.js';
import { signInThroughPage, submitSignIn } from '../support/sign-in-page.js';
import { transitionsDone } from '../support/transitions.js';

// RF-1102, RF-1103, RF-1100, RNF-010, P1-46: the first sign-in of an account the administrator
// created (flow 5): the temporary password leads to the change-password page and to nothing else,
// the rules show while the new password is typed, the new password opens the projects, and from
// then on only the new password signs in. The password is built at run time from harmless pieces.

const chosenPassword = ['my', 'own', 'passphrase', 'for', '2027'].join('-');

test('RF-1102 RF-1103 a temporary password is replaced at the first sign-in and only the new one signs in afterwards', async ({
  page,
}, info) => {
  const account = accountFor('journey-force', info.project.name);
  await signInThroughPage(page, account);

  await expect(page).toHaveURL(/\/account\/password$/u);
  await expect(page.getByRole('heading', { name: 'Choose your password' })).toBeVisible();
  await page.goto('/projects');
  await expect(page).toHaveURL(/\/account\/password$/u);
  await page.getByLabel('Temporary password').fill(account.password);
  await page.getByLabel('New password', { exact: true }).fill(chosenPassword);
  await page.getByLabel('Repeat the new password').fill(chosenPassword);
  const rule = (name: RegExp) =>
    page
      .getByRole('list', { name: 'Password rules' })
      .getByRole('listitem')
      .filter({ hasText: name });
  await expect(rule(/At least 12 characters/u)).toHaveAttribute('data-state', 'pass');
  await expect(rule(/user name/u)).toHaveAttribute('data-state', 'pass');
  await transitionsDone(page);
  await expectNoSeriousViolations(page);
  await page.getByRole('button', { name: 'Save and continue' }).click();

  await expect(page).toHaveURL(/\/projects$/u);
  await expect(page.getByRole('heading', { name: 'Projects', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/sign-in$/u);
  await submitSignIn(page, account);
  await expect(page.getByRole('alert')).toContainText('User name or password is incorrect.');
  await expect(page).toHaveURL(/\/sign-in$/u);
  await submitSignIn(page, { userName: account.userName, password: chosenPassword });
  await expect(page).toHaveURL(/\/projects$/u);
  await expect(page.getByRole('heading', { name: 'Projects', level: 1 })).toBeVisible();
});
