import type { Page } from '@playwright/test';
import { expect, test } from '../support/fixtures.js';
import { expectNoSeriousViolations } from '../support/axe.js';
import { tokensOf } from '../support/cost-run.js';
import {
  buildReport,
  openProjectStart,
  runScan,
  repositories,
  chooseAreas,
} from '../support/journey-pages.js';
import { runStatus, startAndOpenLiveRun } from '../support/live-run-page.js';
import { expectNoFullKey } from '../support/no-full-key.js';
import { filesHolding } from '../support/run-folder.js';
import { accountFor, type Credentials } from '../support/seed.js';
import { e2eServerOpenAiKey } from '../support/server-key.js';
import { signInThroughPage } from '../support/sign-in-page.js';
import { transitionsDone } from '../support/transitions.js';
import { chooseModel, setOutputLimit } from '../support/choose-model.js';

// RF-1104, RF-1105, RF-1106, RF-428, RNF-005, P1-131: the administrator's caps bind only runs on a
// server key. The user has no key of their own, so the run uses the server's (serve.ts holds a fake
// one); the administrator sets the run cap far below the project's own (0.50), the run stops at it
// ("Cap reached"), and the spend sits in the user's total and in the server's month. The caps are
// server-wide, so they are saved just before the run starts and put back to the figures the other
// specs keep (admin-users.spec.ts) as soon as it has ended.

const serverMonthSeed = 8.5;
const keptCaps = { run: '0.5', day: '1', month: '10' } as const;
const lowRunCap = '0.002';

async function signIn(page: Page, who: Credentials): Promise<void> {
  await signInThroughPage(page, who);
  await expect(page).toHaveURL(/\/projects$/u);
}

async function signOut(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/sign-in$/u);
}

async function adminSavesRunCap(page: Page, admin: Credentials, run: string): Promise<void> {
  await signIn(page, admin);
  await page.getByRole('link', { name: 'Users and caps' }).click();
  const caps = page.getByRole('region', { name: 'Caps on server keys' });
  await caps.getByLabel('Per run (USD)').fill(run);
  await caps.getByLabel('Per user per day (USD)').fill(keptCaps.day);
  await caps.getByLabel('Server per month (USD)').fill(keptCaps.month);
  await caps.getByRole('button', { name: 'Save caps' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Caps saved' })).toBeVisible();
}

async function serverMonthOf(page: Page): Promise<number> {
  await page.getByRole('link', { name: 'Users and caps' }).click();
  const meter = page.getByRole('meter', { name: 'Server spend this month' });
  await expect(meter).toBeVisible();
  return Number(await meter.getAttribute('aria-valuenow'));
}

/** The Logs panel, the built report and every file of the server's data folder hold no key. */
async function expectKeyInNoLogOrReport(page: Page): Promise<void> {
  const key = e2eServerOpenAiKey();
  await buildReport(page);
  await page.getByRole('link', { name: 'API calls and logs' }).click();
  await expect(page.getByRole('region', { name: 'Logs' })).toBeVisible();
  await expectNoFullKey(page, [key]);
  const { held, looked } = await filesHolding(key);
  expect(looked, 'the data folder holds the run files').toBeGreaterThan(5);
  expect(held, 'no log, report or run file holds the server key').toEqual([]);
}

async function userPicksTheReader(page: Page, user: Credentials): Promise<void> {
  await signIn(page, user);
  await openProjectStart(page, repositories.webforms);
  await runScan(page);
  await openProjectStart(page, repositories.webforms);
  await page.getByRole('link', { name: 'Project settings' }).click();
  await page.getByLabel('Reader provider', { exact: true }).selectOption('openai');
  await chooseModel(page, 'Reader', 'gpt-5-nano');
  // RF-250: the summariser is a role of the run like the reader; it is priced the same way.
  await page.getByLabel('Summariser provider', { exact: true }).selectOption('openai');
  await chooseModel(page, 'Summariser', 'gpt-5-nano');
  await setOutputLimit(page, 'Reader', 4096);
  await setOutputLimit(page, 'Summariser', 2048);
  // One reader at a time, so the first calls are answered and metered before one is refused.
  await page.getByLabel('Parallel readers', { exact: true }).fill('1');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByText('Settings saved.')).toBeVisible();
  await signOut(page);
}

test(
  'RF-1106 RF-1104 RF-428 a user without a key runs on the server key, stops at the administrator cap, and the totals show the spend',
  { tag: '@caps' },
  async ({ page }, info) => {
    test.setTimeout(240_000);
    const user = accountFor('journey-server', info.project.name);
    const admin = accountFor('journey-admin', info.project.name);
    await userPicksTheReader(page, user);
    await signIn(page, admin);
    const monthBefore = await serverMonthOf(page);
    expect(monthBefore).toBeGreaterThanOrEqual(serverMonthSeed);
    await signOut(page);

    try {
      await adminSavesRunCap(page, admin, lowRunCap);
      await signOut(page);
      await signIn(page, user);
      await openProjectStart(page, repositories.webforms);
      const pill = page.getByTestId('header-totals');
      const before = await tokensOf(pill);
      await chooseAreas(page, ['Catalog', 'Database', 'Services']);
      await page.getByLabel('I understand; send masked excerpts to OpenAI for this run').check();
      await expect(page.getByLabel('Run cap (USD)')).toHaveValue('0.50');
      await startAndOpenLiveRun(page);

      await expect(runStatus(page)).toContainText('Cap reached', { timeout: 90_000 });
      await transitionsDone(page);
      await expectNoSeriousViolations(page);
      await expect(page.getByTestId('run-failure')).toContainText('RST-1600');
      await expect.poll(() => tokensOf(pill), { timeout: 15_000 }).toBeGreaterThan(before);
      await expectNoFullKey(page, [e2eServerOpenAiKey()]);
      await expectKeyInNoLogOrReport(page);
    } finally {
      // However the run ended, the next sign-in starts clean and the caps go back to the shared figures.
      await page.context().clearCookies();
      await adminSavesRunCap(page, admin, keptCaps.run);
    }

    const monthAfter = await serverMonthOf(page);
    expect(monthAfter).toBeGreaterThan(monthBefore);
    await expectNoFullKey(page, [e2eServerOpenAiKey()]);
  },
);
