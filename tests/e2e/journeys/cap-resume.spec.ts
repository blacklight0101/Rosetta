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

// RF-006, RF-422, RF-428, RF-301, ADR-007, ADR-010, P2-13: flow 4 to its end. A run on a priced
// reader stops at the project's run cap ("Cap reached", flow 4 step G), keeps what it did and says
// that the cap must be raised; the owner raises the cap in the project settings and presses Resume;
// the same run goes on with the agents that were left, ends Completed and every claim has its
// verdict. The reader is the recorded webforms run (e2e-provider.ts).

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

async function saveSettings(page: Page, cap: string): Promise<void> {
  await page.getByRole('link', { name: 'Project settings' }).click();
  await page.getByLabel('Reader provider', { exact: true }).selectOption('openai');
  await chooseModel(page, 'Reader', 'gpt-5-nano');
  await page.getByLabel('Summariser provider', { exact: true }).selectOption('openai');
  await chooseModel(page, 'Summariser', 'gpt-5-nano');
  // DEC-117: the threshold to confirm a run is at most the run cap, so both are set together.
  await page.getByLabel('Ask before a run estimated above (USD)', { exact: true }).fill('0.001');
  await page.getByLabel('Run cost cap (USD)', { exact: true }).fill(cap);
  await page.getByLabel('Parallel readers', { exact: true }).fill('1');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByText('Settings saved.')).toBeVisible();
}

test('RF-006 RF-422 RF-301 a run stops at the cap, the owner raises it and resumes, and the same run ends with every claim judged', async ({
  page,
}, info) => {
  test.setTimeout(300_000);
  await signInThroughPage(page, accountFor('journey-run', info.project.name));
  await expect(page).toHaveURL(/\/projects$/u);
  await storeKeyAndPickPricedModels(page);
  await saveSettings(page, '0.002');
  await page.getByRole('link', { name: 'Start a run' }).click();
  await chooseAreas(page, 'all');
  await page.getByLabel('I understand; send masked excerpts to OpenAI for this run').check();
  const live = await startAndOpenLiveRun(page);

  await expect(runStatus(page)).toContainText(/Cap reached|Partly read/u, { timeout: 120_000 });
  await transitionsDone(page);
  await expectNoSeriousViolations(page);
  await expect(page.getByTestId('run-failure')).toContainText('RST-1600');
  await expect(page.getByTestId('resume-note')).toContainText('Raise the cap');
  await openRunTab(page, 'Evidence');
  await expect(agentPanel(page, 'Services')).not.toContainText('Done');

  await page.getByRole('link', { name: 'Start page' }).click();
  await saveSettings(page, '0.5');
  await page.goto(live);
  await page.getByRole('button', { name: 'Resume run' }).click();

  await expect(runStatus(page)).toContainText('Completed', { timeout: 180_000 });
  await expect(page).toHaveURL(live);
  await expect(page.getByRole('button', { name: 'Resume run' })).toHaveCount(0);
  await openRunTab(page, 'Evidence');
  await expect(agentPanel(page, 'Services')).toContainText('Done');
  await expect(page.getByText('Unverified')).toHaveCount(0);
  await expect(page.getByText('Waiting for judgement')).toHaveCount(0);
  await expect(page.getByText(/judged/u).first()).toBeVisible();
});
