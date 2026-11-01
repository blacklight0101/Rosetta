import type { Page } from '@playwright/test';
import { expect, test } from '../support/fixtures.js';
import { expectNoSeriousViolations } from '../support/axe.js';
import { openProjectStart, repositories, runScan, chooseAreas } from '../support/journey-pages.js';
import {
  agentPanel,
  openRunTab,
  runStatus,
  startAndOpenLiveRun,
} from '../support/live-run-page.js';
import { fixtureKeyEndingIn } from '../support/no-full-key.js';
import { accountFor } from '../support/seed.js';
import { signInThroughPage } from '../support/sign-in-page.js';
import { transitionsDone } from '../support/transitions.js';
import { chooseModel } from '../support/choose-model.js';
import { pauseFinishedRun } from '../support/pause-run.js';

// RF-006, RF-422, RF-428, RF-432, RF-301, ADR-007, ADR-010, ADR-026, P2-13, P7-05: flow 4 to its end.
// A run on a priced reader that is approved and paused ("Waiting for your approval") keeps what it
// did; the owner presses Continue and the same run goes on with the agent that was left, ends
// Completed and every claim has its verdict. The recorded webforms run (e2e-provider.ts) spends less
// than its worst case and the ceilings cannot be lowered, so a finished run is put back to a pause
// (pause-run.ts) before the owner answers.

const openAiKey = fixtureKeyEndingIn('journey', 'CAP2');

async function storeKeyAndPickPricedModels(page: Page): Promise<void> {
  await page.goto('/settings');
  const row = page
    .getByTestId('key-row')
    .filter({ has: page.getByRole('heading', { name: 'OpenAI', level: 3, exact: true }) });
  await row.getByLabel('API key').fill(openAiKey);
  await row.getByRole('button', { name: 'Save key' }).click();
  await expect(row).toContainText('CAP2');
  await openProjectStart(page, repositories.webforms);
  await runScan(page);
  await openProjectStart(page, repositories.webforms);
}

async function saveSettings(page: Page): Promise<void> {
  await page.getByRole('link', { name: 'Project settings', exact: true }).click();
  await page.getByLabel('Reader provider', { exact: true }).selectOption('openai');
  await chooseModel(page, 'Reader', 'gpt-5-nano');
  await page.getByLabel('Summariser provider', { exact: true }).selectOption('openai');
  await chooseModel(page, 'Summariser', 'gpt-5-nano');
  await page.getByLabel('Parallel readers', { exact: true }).fill('1');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByText('Settings saved.')).toBeVisible();
}

test('RF-006 RF-422 RF-301 RF-432 a run pauses at the amount approved, the owner presses Continue, and the same run ends with every claim judged', async ({
  page,
}, info) => {
  test.setTimeout(300_000);
  await signInThroughPage(page, accountFor('journey-run', info.project.name));
  await expect(page).toHaveURL(/\/projects$/u);
  await storeKeyAndPickPricedModels(page);
  await saveSettings(page);
  await page.getByRole('link', { name: 'Start a run' }).click();
  await chooseAreas(page, 'all');
  await page.getByLabel('I understand; send masked excerpts to OpenAI for this run').check();
  const live = await startAndOpenLiveRun(page);

  await expect(runStatus(page)).toContainText('Completed', { timeout: 180_000 });
  const runUuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/u.exec(live)?.[0];
  if (runUuid === undefined) throw new Error(`No run id in ${live}`);
  await pauseFinishedRun(page, runUuid, 'Services');
  await page.goto(live);
  await expect(page.getByTestId('approval-question')).toBeVisible({ timeout: 30_000 });
  await transitionsDone(page);
  await expectNoSeriousViolations(page);
  await openRunTab(page, 'All agents');
  await expect(agentPanel(page, 'Services')).toHaveCount(0);

  await page.getByRole('button', { name: /^Continue/u }).click();

  await expect(runStatus(page)).toContainText('Completed', { timeout: 180_000 });
  await expect(page).toHaveURL(live);
  await expect(page.getByTestId('approval-question')).toHaveCount(0);
  await openRunTab(page, 'Evidence');
  await expect(agentPanel(page, 'Services')).toContainText('Done');
  await expect(page.getByText('Unverified')).toHaveCount(0);
  await expect(page.getByText('Waiting for judgement')).toHaveCount(0);
  await expect(page.getByText(/judged/u).first()).toBeVisible();
});
