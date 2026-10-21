import type { Locator, Page } from '@playwright/test';
import { expectNoSeriousViolations } from '../support/axe.js';
import { expect, test } from '../support/fixtures.js';
import { openScannedStartPage } from '../support/cost-run.js';
import { scanAndChooseModels } from '../support/full-run-pages.js';
import { chooseAreas } from '../support/journey-pages.js';
import { heldReaderModel, planFailsModel } from '../support/journey-models.js';
import {
  agentPanel,
  openRunTab,
  runStatus,
  startAndOpenLiveRun,
  startUnderstand,
} from '../support/live-run-page.js';
import { estimate, writeButton } from '../support/plan-setup-page.js';
import { accountFor } from '../support/seed.js';
import { signInAs } from '../support/sign-in.js';
import { signInThroughPage } from '../support/sign-in-page.js';
import { replayRunId } from '../support/seed-replay.js';
import { transitionsDone } from '../support/transitions.js';

// RF-615, RF-614, RF-006, DEC-143, RNF-010: the journey from code to package on the pages of the
// failure paths, driven by real runs of the test server and its model double (e2e-provider.ts). An
// understand run that is stopped locks the plan steps and offers Resume; a plan run that fails
// (the planner of the project answers in prose, RST-1803) leaves the understand run, its questions
// and the brief as they were and offers "Try the plan again", which opens Plan setup for a new
// estimate. The strip fits 360 px without a sideways scroll, and axe is clean in both themes.

const journey = (page: Page): Locator =>
  page.getByRole('region', { name: 'Journey from code to package' });

/** The item of a step, found by its title. */
const stepOf = (page: Page, title: string): Locator =>
  journey(page)
    .getByRole('listitem')
    .filter({
      has: page.locator('.rst-road__title', { hasText: new RegExp(`^${title}$`, 'u') }),
    });

/** Nothing of the page is beside the viewport. */
async function expectNoSidewaysScroll(page: Page): Promise<void> {
  const sideways = await page.evaluate(
    'document.documentElement.scrollWidth - document.documentElement.clientWidth',
  );
  expect(sideways).toBeLessThanOrEqual(0);
}

test.describe.configure({ mode: 'serial' });

test('RF-615 RF-006 an understand run that was stopped locks the plan steps and offers Resume, which runs it again', async ({
  page,
}, info) => {
  // A scan, then a run that is stopped at the held reader: longer than the default 30 s.
  test.setTimeout(120_000);
  await signInAs(page.context(), accountFor('live-controls', info.project.name));
  await openScannedStartPage(page);
  const live = await startUnderstand(page, ['Catalog', 'Controllers']);
  await openRunTab(page, 'All agents');
  await expect(agentPanel(page, 'Controllers')).toContainText('Running', { timeout: 30_000 });
  await page.getByRole('button', { name: 'Stop run' }).click();
  await expect(runStatus(page)).toContainText('Interrupted', { timeout: 30_000 });

  await expect(journey(page)).toBeVisible();
  await expect(journey(page).getByRole('listitem')).toHaveCount(7);
  await expect(stepOf(page, 'Understand')).toContainText('Failed');
  await expect(stepOf(page, 'Understand')).toContainText('Interrupted');
  await expect(stepOf(page, 'Understand')).toContainText('Current step');
  await expect(stepOf(page, 'Understand')).toHaveAttribute('aria-current', 'step');
  for (const title of ['Brief', 'Estimate', 'Plan', 'Package']) {
    await expect(stepOf(page, title)).toContainText('Locked');
    await expect(stepOf(page, title).getByRole('link')).toHaveCount(0);
  }
  await expect(stepOf(page, 'Brief')).toContainText('Needs a completed run: resume it first');
  await expect(
    page
      .getByRole('region', { name: 'Your turn' })
      .getByRole('button', { name: 'Set up the plan' }),
  ).toHaveCount(0);
  await transitionsDone(page);
  await expectNoSeriousViolations(page);

  await journey(page).getByRole('button', { name: 'Resume this run' }).click();

  await expect(page).toHaveURL(live);
  await expect(runStatus(page)).toContainText('Running', { timeout: 30_000 });
  await expect(journey(page)).toHaveCount(0);
});

test('RF-615 RF-614 a failed plan leaves the earlier steps as they were and Try the plan again opens a new estimate', async ({
  page,
}, info) => {
  // A scan, an understand run, the brief and a plan run: longer than the default 30 s.
  test.setTimeout(240_000);
  await signInThroughPage(page, accountFor('journey-run', info.project.name));
  await expect(page).toHaveURL(/\/projects$/u);
  await scanAndChooseModels(page, { reader: heldReaderModel, planner: planFailsModel });
  await chooseAreas(page, ['Catalog']);
  await startAndOpenLiveRun(page);
  await expect(runStatus(page)).toContainText('Completed', { timeout: 90_000 });
  await expect(stepOf(page, 'Understand')).toContainText('Done');
  const turn = page.getByRole('region', { name: 'Your turn' });
  await turn.getByRole('button', { name: 'Set up the plan' }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}\/plan-setup\?run=[0-9a-f-]{36}$/u);
  await expect(journey(page)).toBeVisible();
  await expect(stepOf(page, 'Brief')).toContainText('Not saved yet');
  await expect(stepOf(page, 'Estimate')).toContainText('Locked');

  await page.getByRole('button', { name: 'Use the defaults for the rest' }).click();

  await expect(stepOf(page, 'Brief')).toContainText('Brief saved');
  await expect(stepOf(page, 'Estimate')).toHaveAttribute('aria-current', 'step');
  await expect(estimate(page)).toContainText(/(\$[\d.]+|[\d,]+ tokens) likely/u);
  await expectNoSeriousViolations(page);
  await writeButton(page).click();
  await expect(runStatus(page)).toContainText('Failed', { timeout: 90_000 });

  await expect(stepOf(page, 'Plan')).toContainText('Failed');
  await expect(stepOf(page, 'Plan')).toContainText(/RST-180[35]/u);
  await expect(stepOf(page, 'Plan')).toContainText('Current step');
  await expect(stepOf(page, 'Understand')).toContainText('Done');
  await expect(stepOf(page, 'Brief')).toContainText('Brief saved');
  await expect(stepOf(page, 'Package')).toContainText('Locked');
  await expect(stepOf(page, 'Package').getByRole('link')).toHaveCount(0);
  await page.setViewportSize({ width: 360, height: 780 });
  await expectNoSidewaysScroll(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await transitionsDone(page);
  await expectNoSeriousViolations(page);

  await journey(page).getByRole('button', { name: 'Try the plan again' }).click();

  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}\/plan-setup\?run=[0-9a-f-]{36}$/u);
  await expect(estimate(page)).toContainText(/(\$[\d.]+|[\d,]+ tokens) likely/u);
  await expect(writeButton(page)).toBeEnabled();
  await expect(stepOf(page, 'Plan')).toContainText('Failed');
  await expectNoSeriousViolations(page);
});

test('RF-627 RF-615 a package written with gaps reads "Written with gaps" and links checks.md and the download, never Done', async ({
  page,
}, info) => {
  await signInAs(page.context(), accountFor('replay', info.project.name));
  // The facts of the journey: the recorded run, and a plan run that wrote the package and ended RST-1806.
  const planId = '00000000-0000-4000-a0ee-0000000000f1';
  const ended = { queueState: 'Ended', endedAt: '2026-10-12T10:31:00.000Z' };
  await page.route('**/api/projects/*/journey*', async (route) => {
    await route.fulfill({
      json: {
        scanRunId: null,
        briefSaved: true,
        source: {
          ...{ id: replayRunId(info.project.name), runKey: '20261012-100000-understand' },
          ...{ endState: 'Completed', costMicros: 120_000, errorCode: null, ...ended },
          ...{ supportedClaims: 4, openQuestions: 0 },
        },
        plan: {
          ...{ id: planId, runKey: '20261012-103000-plan', endState: 'Failed' },
          ...{ costMicros: 31_000, errorCode: 'RST-1806', ...ended },
        },
        handoff: { runId: planId, runKey: '20261012-103000-plan', outOfDate: false, gaps: true },
      },
    });
  });

  await page.goto(`/runs/${replayRunId(info.project.name)}`);

  const written = stepOf(page, 'Package');
  await expect(written).toContainText('With gaps');
  await expect(written).toContainText('Written with gaps');
  await expect(written).not.toContainText('Done');
  await expect(written.getByRole('link', { name: 'checks.md' })).toHaveAttribute(
    'href',
    /\/runs\/[0-9a-f-]{36}\/files\/handoff\/checks\.md$/u,
  );
  await expect(written.getByRole('link', { name: 'Download the package' })).toHaveAttribute(
    'href',
    /\/api\/runs\/[0-9a-f-]{36}\/handoff\.zip$/u,
  );
  await expect(stepOf(page, 'Plan')).toContainText('RST-1806');
  await expect(journey(page).getByRole('button', { name: 'Try the plan again' })).toBeVisible();
  await page.setViewportSize({ width: 360, height: 780 });
  await expectNoSidewaysScroll(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await transitionsDone(page);
  await expectNoSeriousViolations(page);
});
