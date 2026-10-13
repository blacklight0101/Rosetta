import type { Page } from '@playwright/test';
import { expect, test } from '../support/fixtures.js';
import { createAccount } from '../support/admin-page.js';
import { expectNoSeriousViolations } from '../support/axe.js';
import { tokensOf } from '../support/cost-run.js';
import { openProjectStart, runScan, repositories, chooseAreas } from '../support/journey-pages.js';
import { runStatus, startAndOpenLiveRun } from '../support/live-run-page.js';
import { fixtureKeyEndingIn } from '../support/no-full-key.js';
import { accountFor, type Credentials } from '../support/seed.js';
import { signInThroughPage } from '../support/sign-in-page.js';
import { transitionsDone } from '../support/transitions.js';
import { fixturePassword } from '../../support/account-fixtures.js';

// RF-1102, RF-1106, RF-1104, RF-422, RF-1010, RF-428, RNF-010, P1-46: the administrator creates a
// user and saves the caps (the same figures as admin-users.spec.ts, so the server's month stays
// under the banner the cost specs expect); the user signs in, stores a key, points the reader at a
// priced model and starts a run whose cap is smaller than two calls at their worst case. The run
// stops at the cap ("Cap reached"), keeps what was spent, and the header totals and the cost page
// still show it (flow 4).

const openAiKey = fixtureKeyEndingIn('journey', 'CAP1');

async function adminCreatesUser(page: Page, admin: Credentials, user: Credentials): Promise<void> {
  await signInThroughPage(page, admin);
  await page.getByRole('link', { name: 'Users and caps' }).click();
  await expect(page.getByRole('heading', { name: 'Users and caps', level: 1 })).toBeVisible();
  await createAccount(page, { ...user, mustChange: false });
  await expect(page.getByRole('status').filter({ hasText: 'Created account' })).toBeVisible();
  const caps = page.getByRole('region', { name: 'Caps on server keys' });
  await caps.getByLabel('Per run (USD)').fill('0.5');
  await caps.getByLabel('Per user per day (USD)').fill('1');
  await caps.getByLabel('Server per month (USD)').fill('10');
  await caps.getByRole('button', { name: 'Save caps' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Caps saved' })).toBeVisible();
  await expectNoSeriousViolations(page);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/sign-in$/u);
}

async function userStoresKeyAndPricedReader(page: Page): Promise<void> {
  await page.goto('/settings');
  const row = page
    .getByTestId('key-row')
    .filter({ has: page.getByRole('heading', { name: 'OpenAI', level: 3, exact: true }) });
  await row.getByLabel('API key').fill(openAiKey);
  await row.getByRole('button', { name: 'Save key' }).click();
  await expect(row).toContainText('CAP1');
  await openProjectStart(page, repositories.webforms);
  await runScan(page);
  await openProjectStart(page, repositories.webforms);
  await page.getByRole('link', { name: 'Project settings' }).click();
  await page.getByLabel('Reader provider', { exact: true }).selectOption('openai');
  await page.getByLabel('Reader model', { exact: true }).fill('gpt-5-nano');
  // DEC-117: the threshold to confirm a run is at most the run cap, so both are set together.
  await page.getByLabel('Run cost cap (USD)').fill('0.002');
  await page.getByLabel('Ask before a run estimated above (USD)').fill('0.001');
  // One reader at a time, so the first calls are answered and metered before one is refused.
  await page.getByLabel('Parallel readers').fill('1');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByText('Settings saved.')).toBeVisible();
  await page.getByRole('link', { name: 'Start a run' }).click();
}

test('RF-1106 RF-422 RF-1010 an administrator creates a user, and the user run stops at the cap with its spend still in the totals', async ({
  page,
}, info) => {
  test.setTimeout(240_000);
  const project = info.project.name;
  const user: Credentials = {
    userName: `e2e-journey-cap-${project}`,
    password: fixturePassword('JourneyCap'),
  };
  await adminCreatesUser(page, accountFor('journey-admin', project), user);

  await signInThroughPage(page, user);
  await expect(page).toHaveURL(/\/projects$/u);
  await userStoresKeyAndPricedReader(page);
  const pill = page.getByTestId('header-totals');
  const before = await tokensOf(pill);
  await chooseAreas(page, ['Catalog', 'Database', 'Services']);
  await page.getByLabel('I understand; send masked excerpts to OpenAI for this run').check();
  await expect(page.getByLabel('Run cap (USD)')).toHaveValue('0.002');
  await startAndOpenLiveRun(page);

  await expect(runStatus(page)).toContainText('Cap reached', { timeout: 90_000 });
  await transitionsDone(page);
  await expectNoSeriousViolations(page);
  await expect.poll(() => tokensOf(pill), { timeout: 15_000 }).toBeGreaterThan(before);
  await expect(page.getByTestId('run-failure')).toContainText('RST-1600');
  await page.getByRole('link', { name: 'Start page' }).click();
  await pill.getByRole('link', { name: /Your total/u }).click();
  await expect(page.getByRole('heading', { name: 'Project cost', level: 1 })).toBeVisible();
  await expect(page.getByRole('table', { name: 'By model' })).toContainText('gpt-5-nano');
  await expect(page.getByRole('table', { name: 'By run' }).getByRole('link')).not.toHaveCount(0);
  await expectNoSeriousViolations(page);
});
