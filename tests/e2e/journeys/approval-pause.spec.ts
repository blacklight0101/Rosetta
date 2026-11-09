import type { Page } from '@playwright/test';
import { z } from 'zod';
import { expect, test } from '../support/fixtures.js';
import { expectNoSeriousViolations } from '../support/axe.js';
import { chooseAreas } from '../support/journey-pages.js';
import { approveJourneyAt, projectOf, spentTokensOf } from '../support/journey-amount.js';
import { pressStart, runStatus, RUN_DONE } from '../support/live-run-page.js';
import { accountFor } from '../support/seed.js';
import { e2eOrigin } from '../support/server-config.js';
import { signInThroughPage } from '../support/sign-in-page.js';
import { transitionsDone } from '../support/transitions.js';
import { fixtureZip, uploadFromNewProject } from '../support/zip-journey.js';

// RF-432, RF-435, RF-434, DEC-206, P8-03, EV-84: the pause is real. After the first run (Analyse, the
// recorded run of the fake provider, default settings) a second understand step is measured in an
// unconstrained pass; the same step is then approved at exactly 120% of its own spend. It takes what
// is left of the journey as its line and pauses at it ("Waiting for your approval"); Continue (+N)
// lets it go on and Stop here ends it "Partly read". The steps are started through the run-start API,
// which keeps its stage parameter for the evaluation tools (ADR-027); the journey amount is the row
// Analyse writes, set from the measured spend.

const runUuidOf = (url: string): string => {
  const found = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/u.exec(url);
  if (found === null) throw new Error(`No run id in ${url}`);
  return found[0];
};

async function analyse(page: Page): Promise<string> {
  await uploadFromNewProject(page, 'OrderDesk.zip', await fixtureZip());
  await expect(page.getByRole('table', { name: 'Estimate per role' })).toBeVisible({
    timeout: 60_000,
  });
  await chooseAreas(page, ['Catalog']);
  await pressStart(page);
  await expect(runStatus(page)).toContainText(RUN_DONE, { timeout: 120_000 });
  return runUuidOf(page.url());
}

/** Starts a second understand step of the project through the run-start API; returns its run id. */
async function startStep(page: Page, projectId: string): Promise<string> {
  const session = z
    .object({ csrfToken: z.string() })
    .parse(await (await page.context().request.get('/api/session')).json());
  const started = await page.context().request.post(`/api/projects/${projectId}/runs`, {
    data: { stage: 'understand', areas: ['Catalog'] },
    headers: { origin: e2eOrigin(), 'x-csrf-token': session.csrfToken },
  });
  expect(started.status()).toBe(202);
  return z.object({ id: z.string() }).parse(await started.json()).id;
}

/**
 * Measures the spend of a step in an unconstrained pass (the same step, replayed deterministically),
 * then approves the journey so that exactly 120% of that spend is left, starts the same step again
 * and opens it paused.
 */
async function pausedSecondStep(page: Page): Promise<void> {
  const first = await analyse(page);
  const projectId = await projectOf(first);
  const firstSpent = await spentTokensOf(first);
  expect(firstSpent).toBeGreaterThan(0);
  expect(await approveJourneyAt(first, { tokens: firstSpent * 20, costMicros: 5_000_000 })).toBe(1);
  const measuredRun = await startStep(page, projectId);
  await page.goto(`/runs/${measuredRun}`);
  await expect(runStatus(page)).toContainText(RUN_DONE, { timeout: 180_000 });
  const stepSpent = await spentTokensOf(measuredRun);
  expect(stepSpent).toBeGreaterThan(0);

  const line = Math.ceil(stepSpent * 1.2);
  await approveJourneyAt(first, { tokens: firstSpent + stepSpent + line, costMicros: 5_000_000 });
  await page.goto(`/runs/${await startStep(page, projectId)}`);

  await expect(page.getByTestId('approval-question')).toBeVisible({ timeout: 180_000 });
  await expect(runStatus(page)).toContainText('Waiting for your approval');
}

test('RF-432 RF-435 a step approved near the real spend pauses at the line and Continue (+N) lets it go on', async ({
  page,
}, info) => {
  test.setTimeout(420_000);
  await signInThroughPage(page, accountFor('approval-pause', info.project.name));
  await expect(page).toHaveURL(/\/projects$/u);
  await pausedSecondStep(page);
  await transitionsDone(page);
  await expectNoSeriousViolations(page);

  // Each Continue adds N (half of the line): the question goes away and the same run resumes; it asks
  // again until the run has what it needs and completes.
  const status = runStatus(page);
  const question = page.getByTestId('approval-question');
  let answers = 0;
  for (
    ;
    answers < 8 && (await status.innerText()).includes('Waiting for your approval');
    answers += 1
  ) {
    await page.getByRole('button', { name: /^Continue/u }).click();
    await expect(question).toHaveCount(0, { timeout: 60_000 });
    const asksAgain = async (): Promise<boolean> =>
      (await question.count()) > 0 || RUN_DONE.test(await status.innerText());
    await expect.poll(asksAgain, { timeout: 180_000 }).toBe(true);
  }
  expect(answers).toBeGreaterThan(0);
  await expect(status).toContainText(RUN_DONE);
});

test('RF-432 RF-435 Stop here ends a paused step at its cap', async ({ page }, info) => {
  test.setTimeout(420_000);
  await signInThroughPage(page, accountFor('approval-pause', info.project.name));
  await expect(page).toHaveURL(/\/projects$/u);
  await pausedSecondStep(page);

  await page.getByRole('button', { name: 'Stop here' }).click();

  await expect(runStatus(page)).toHaveText('Partly read', { timeout: 60_000 });
  await expect(page.getByTestId('approval-question')).toHaveCount(0);
});
