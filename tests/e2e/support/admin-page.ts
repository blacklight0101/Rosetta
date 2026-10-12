import type { Locator, Page } from '@playwright/test';

// P1-42: the pieces of the administration pages the specs share.

/** The row of the accounts table whose user name is `userName`. */
export function accountRow(page: Page, userName: string): Locator {
  return page.getByRole('row').filter({ hasText: userName });
}

/** Fills the Create an account form and presses its button; `mustChange` is the checkbox. */
export async function createAccount(
  page: Page,
  account: { userName: string; password: string; mustChange: boolean },
): Promise<void> {
  const form = page.getByRole('region', { name: 'Create an account' });
  await form.getByLabel('User name').fill(account.userName);
  await form.getByLabel('Display name').fill(`Display ${account.userName}`);
  await form.getByLabel('Initial password').fill(account.password);
  const box = form.getByLabel('Must choose a new password at first sign-in');
  await box.setChecked(account.mustChange);
  await form.getByRole('button', { name: 'Create account' }).click();
}
