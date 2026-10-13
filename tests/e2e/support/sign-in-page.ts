import type { Page } from '@playwright/test';
import { ensureAccount, type Credentials } from './seed.js';

// RF-1100: signs in through the sign-in page, as a person would (the form, not the API).

/** Fills the form of /sign-in and presses Sign in; the caller waits for what it expects. */
export async function submitSignIn(page: Page, credentials: Credentials): Promise<void> {
  await ensureAccount(credentials);
  await page.getByLabel('User name').fill(credentials.userName);
  await page.getByLabel('Password', { exact: true }).fill(credentials.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
}

/** Opens /sign-in and submits the credentials. */
export async function signInThroughPage(page: Page, credentials: Credentials): Promise<void> {
  await page.goto('/sign-in');
  await submitSignIn(page, credentials);
}
