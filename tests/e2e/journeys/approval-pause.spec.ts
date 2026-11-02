import type { Page } from '@playwright/test';
import { z } from 'zod';
import { expect, test } from '../support/fixtures.js';
import { expectNoSeriousViolations } from '../support/axe.js';
import { chooseAreas } from '../support/journey-pages.js';
import { approveJourneyAt, projectOf, spentTokensOf } from '../support/journey-amount.js';
import { pressStart, runStatus } from '../support/live-run-page.js';
import { accountFor } from '../support/seed.js';
import { e2eOrigin } from '../support/server-config.js';
import { signInThroughPage } from '../support/sign-in-page.js';
import { transitionsDone } from '../support/transitions.js';
import { fixtureZip, uploadFromNewProject } from '../support/zip-journey.js';

// RF-432, RF-435, RF-434, DEC-206, P8-03, EV-84: the pause is real. A journey approved at 120% of
// the real spend of its first run (the recorded run of the fake provider) cannot pay for a second
// understand step: that step takes what is left of the journey as its line, pauses at it
// ("Waiting for your approval"), Continue (+N) lets it go on, and Stop here ends it "Cap reached".
// The second step is started through the run-start API, which keeps its stage parameter for the
// evaluation tools (ADR-027); the journey amount is the row Analyse writes, set to 120% of the spend.

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
  await expect(runStatus(page)).toContainText('Completed', { timeout: 120_000 });
  return runUuidOf(page.url());
}

/** Approves the journey at 120% of the first run's spend, starts a second step and opens it. */
async function pausedSecondStep(page: Page): Promise<void> {
  const first = await analyse(page);
  const spent = await spentTokensOf(first);
  expect(spent).toBeGreaterThan(0);
  expect(
    await approveJourneyAt(first, { tokens: Math.ceil(spent * 2.2), costMicros: 5_000_000 }),
  ).toBe(1);

  const session = z
    .object({ csrfToken: z.string() })
    .parse(await (await page.context().request.get('/api/session')).json());
  const started = await page
    .context()
    .request.post(`/api/projects/${await projectOf(first)}/runs`, {
      data: { stage: 'understand', areas: ['Catalog'] },
      headers: { origin: e2eOrigin(), 'x-csrf-token': session.csrfToken },
    });
  expect(started.status()).toBe(202);
  const second = z.object({ id: z.string() }).parse(await started.json());
  await page.goto(`/runs/${second.id}`);

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
      (await question.count()) > 0 || (await status.innerText()).includes('Completed');
    await expect.poll(asksAgain, { timeout: 180_000 }).toBe(true);
  }
  expect(answers).toBeGreaterThan(0);
  await expect(status).toContainText('Completed');
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
