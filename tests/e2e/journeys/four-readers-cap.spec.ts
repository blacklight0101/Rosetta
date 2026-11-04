import type { Page } from '@playwright/test';
import { expect, test } from '../support/fixtures.js';
import { expectNoSeriousViolations } from '../support/axe.js';
import { tokensOf } from '../support/cost-run.js';
import { openProjectStart, runScan, repositories, chooseAreas } from '../support/journey-pages.js';
import { runStatus, startAndOpenLiveRun } from '../support/live-run-page.js';
import { accountFor, type Credentials } from '../support/seed.js';
import { signInThroughPage } from '../support/sign-in-page.js';
import { transitionsDone } from '../support/transitions.js';
import { chooseModel, setOutputLimit } from '../support/choose-model.js';
import { saveHostedReaderWithFourParallelReaders } from '../support/parallel-readers.js';

// RF-422, RF-429, RF-436, P8-132, Q-67: four parallel readers at a cap under two calls at their
// worst case. The readers' room counts the calls in flight, so one call is made, answered and
// booked, and the run stops at the administrator's run cap after it ("Cap reached": the three areas
// were all started, so it is not "Partly read" as with one reader), with the spend in the totals,
// where the second call used to be refused at once and the call in flight cancelled, so that the
// run booked nothing. admin-and-cap.spec.ts and server-key-cap.spec.ts keep one reader. The administrator's caps are server-wide: they are saved
// just before the run and put back to the figures the other specs keep (admin-users.spec.ts).

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

async function userPicksTheReader(page: Page, user: Credentials): Promise<void> {
  await signIn(page, user);
  await openProjectStart(page, repositories.webforms);
  await runScan(page);
  await openProjectStart(page, repositories.webforms);
  await page.getByRole('link', { name: 'Project settings', exact: true }).click();
  await page.getByLabel('Reader provider', { exact: true }).selectOption('openai');
  await chooseModel(page, 'Reader', 'gpt-5-nano');
  await page.getByLabel('Summariser provider', { exact: true }).selectOption('openai');
  await chooseModel(page, 'Summariser', 'gpt-5-nano');
  await setOutputLimit(page, 'Reader', 4096);
  await setOutputLimit(page, 'Summariser', 2048);
  // The save that moves the reader to OpenAI makes it four (RF-436); they are kept at four.
  await saveHostedReaderWithFourParallelReaders(page);
  await signOut(page);
}

test(
  'RF-429 RF-422 four parallel readers at a cap under two worst-case calls make one call, book it, and stop at the cap',
  { tag: '@caps' },
  async ({ page }, info) => {
    test.setTimeout(240_000);
    const user = accountFor('journey-server', info.project.name);
    const admin = accountFor('journey-admin', info.project.name);
    await userPicksTheReader(page, user);

    try {
      await adminSavesRunCap(page, admin, lowRunCap);
      await signOut(page);
      await signIn(page, user);
      await openProjectStart(page, repositories.webforms);
      const pill = page.getByTestId('header-totals');
      const before = await tokensOf(pill);
      await chooseAreas(page, ['Catalog', 'Database', 'Services']);
      await page.getByLabel('I understand; send masked excerpts to OpenAI for this run').check();
      await startAndOpenLiveRun(page);

      await expect(runStatus(page)).toContainText('Cap reached', { timeout: 90_000 });
      await transitionsDone(page);
      await expectNoSeriousViolations(page);
      await expect(page.getByTestId('run-failure')).toContainText('RST-1600');
      await expect.poll(() => tokensOf(pill), { timeout: 15_000 }).toBeGreaterThan(before);
    } finally {
      await page.context().clearCookies();
      await adminSavesRunCap(page, admin, keptCaps.run);
    }
  },
);
