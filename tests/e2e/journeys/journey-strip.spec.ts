import type { Page } from '@playwright/test';
import { expectNoSeriousViolations } from '../support/axe.js';
import { expect, test } from '../support/fixtures.js';
import { openScannedStartPage } from '../support/cost-run.js';
import { scanAndChooseModels } from '../support/full-run-pages.js';
import { chooseAreas } from '../support/journey-pages.js';
import { heldReaderModel, planFailsModel } from '../support/journey-models.js';
import {
  gappedPlan,
  journey,
  rowsOf,
  routeJourney,
  showStepDetails,
  stepOf,
} from '../support/journey-strip.js';
import {
  agentPanel,
  openRunTab,
  runStatus,
  startAndOpenLiveRun,
  startUnderstand,
  RUN_DONE,
} from '../support/live-run-page.js';
import { estimate, writeButton } from '../support/plan-setup-page.js';
import { accountFor } from '../support/seed.js';
import { signInAs } from '../support/sign-in.js';
import { signInThroughPage } from '../support/sign-in-page.js';
import { replayRunId } from '../support/seed-replay.js';
import { transitionsDone } from '../support/transitions.js';

/** RF-1021 (P8-84): Set up the plan, or the link that skips the Deepen first. */
const setUpThePlan = /^(Skip the Deepen and s|S)et up the plan$/u;

// RF-615, RF-614, RF-006, DEC-143, RNF-010: the journey from code to package on the pages of the
// failure paths, driven by real runs of the test server and its model double (e2e-provider.ts). An
// understand run that is stopped locks the plan steps and offers Resume; a plan run that fails
// (the planner of the project answers in prose, RST-1803) leaves the understand run, its questions
// and the brief as they were and offers "Try the plan again", which opens Plan setup for a new
// estimate. The strip fits 360 px without a sideways scroll, and axe is clean in both themes.

/** Nothing of the page is beside the viewport. */
async function expectNoSidewaysScroll(page: Page): Promise<void> {
  const sideways = await page.evaluate(
    'document.documentElement.scrollWidth - document.documentElement.clientWidth',
  );
  expect(sideways).toBeLessThanOrEqual(0);
}

/** The strip fits a 360 px phone without a sideways scroll, then the window goes back to 1280 px. */
async function expectPhoneFits(page: Page): Promise<void> {
  await page.setViewportSize({ width: 360, height: 780 });
  await expectNoSidewaysScroll(page);
  await page.setViewportSize({ width: 1280, height: 800 });
}

test.describe.configure({ mode: 'serial' });

test('RF-615 RF-006 an understand run that was stopped locks the plan steps and offers Resume, which runs it again', async ({
  page,
}, info) => {
  // A scan, a run stopped at the held reader and its resume, each of which may wait for one of the
  // server's two run slots (RF-1108): longer than the default 30 s.
  test.setTimeout(240_000);
  await signInAs(page.context(), accountFor('live-controls', info.project.name));
  await openScannedStartPage(page);
  const live = await startUnderstand(page, ['Catalog', 'Controllers']);
  await openRunTab(page, 'All agents');
  await expect(agentPanel(page, 'Controllers')).toContainText('Running', { timeout: 90_000 });
  await page.getByRole('button', { name: 'Stop run' }).click();
  await expect(runStatus(page)).toContainText('Stopped by you', { timeout: 30_000 });

  await expect(journey(page)).toBeVisible();
  await expect(journey(page).getByRole('listitem')).toHaveCount(7);
  await expect(stepOf(page, 'Understand')).not.toContainText('Failed');
  await expect(stepOf(page, 'Understand')).toContainText('Stopped by you');
  await expect(stepOf(page, 'Understand')).toContainText('Current step');
  await expect(stepOf(page, 'Understand')).toHaveAttribute('aria-current', 'step');
  for (const title of ['Brief', 'Estimate', 'Plan', 'Package']) {
    await expect(stepOf(page, title)).toContainText('Locked');
    await expect(stepOf(page, title).getByRole('link')).toHaveCount(0);
  }
  await showStepDetails(page);
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
  // RF-006, RF-1108: a resume that waits for a run slot reads Queued, then Running once it starts.
  await expect(runStatus(page)).toContainText('Running', { timeout: 90_000 });
  // RF-1020: the strip is on every run page, also while the run works.
  await expect(journey(page)).toBeVisible();
  await showStepDetails(page);
  await expect(stepOf(page, 'Understand')).toContainText('Running now');
  // The resumed run waits at the held reader again: stopped, it frees its run slot for other tests.
  await page.getByRole('button', { name: 'Stop run' }).click();
  await expect(runStatus(page)).toContainText('Stopped by you', { timeout: 30_000 });
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
  await expect(runStatus(page)).toContainText(RUN_DONE, { timeout: 90_000 });
  await expect(stepOf(page, 'Understand')).toContainText('Done');
  const turn = page.getByRole('region', { name: 'Your turn' });
  // RF-1021 (P8-84): below the coverage bar Deepen is the primary button and the plan a link under it.
  await turn.getByRole('button', { name: setUpThePlan }).click();
  await expect(page).toHaveURL(/\/projects\/[0-9a-f-]{36}\/plan-setup\?run=[0-9a-f-]{36}$/u);
  await expect(journey(page)).toBeVisible();
  await showStepDetails(page);
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
  await showStepDetails(page);
  await expect(stepOf(page, 'Plan')).toContainText(/RST-180[35]/u);
  await expect(stepOf(page, 'Plan')).toContainText('Current step');
  await expect(stepOf(page, 'Understand')).toContainText('Done');
  await expect(stepOf(page, 'Brief')).toContainText('Brief saved');
  await expect(stepOf(page, 'Package')).toContainText('Locked');
  await expect(stepOf(page, 'Package').getByRole('link')).toHaveCount(0);
  await expectPhoneFits(page);
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
  await routeJourney(page, info.project.name, gappedPlan());

  await page.goto(`/runs/${replayRunId(info.project.name)}`);

  await showStepDetails(page);
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
  await expectPhoneFits(page);
  await transitionsDone(page);
  await expectNoSeriousViolations(page);
});

test('RF-615 a completed run with no Supported claim locks the questions step like the plan steps, at 360 px and in both themes', async ({
  page,
}, info) => {
  await signInAs(page.context(), accountFor('replay', info.project.name));
  // The facts of the journey: the recorded run, read again as one that gave no Supported claim.
  const ended = { queueState: 'Ended', endedAt: '2026-10-12T10:31:00.000Z' };
  await page.route('**/api/projects/*/journey*', async (route) => {
    await route.fulfill({
      json: {
        scanRunId: null,
        briefSaved: false,
        source: {
          ...{ id: replayRunId(info.project.name), runKey: '20261012-100000-understand' },
          ...{ endState: 'Completed', costMicros: 120_000, errorCode: null, ...ended },
          ...{ supportedClaims: 0, openQuestions: 0 },
        },
        plan: null,
        handoff: null,
      },
    });
  });

  await page.goto(`/runs/${replayRunId(info.project.name)}`);

  for (const title of ['Questions', 'Brief', 'Estimate', 'Plan', 'Package']) {
    await expect(stepOf(page, title)).toContainText('Locked');
    await expect(stepOf(page, title).getByRole('link')).toHaveCount(0);
  }
  await showStepDetails(page);
  await expect(stepOf(page, 'Questions')).toContainText('Nothing to plan from');
  await expect(stepOf(page, 'Questions')).not.toContainText('No open questions');
  await expect(stepOf(page, 'Brief')).toContainText('Nothing to plan from');
  await expectPhoneFits(page);
  await transitionsDone(page);
  await expectNoSeriousViolations(page);
});

test('RF-1020 P8-100 the strip of a run page is one compact row that expands to the detail cards on request', async ({
  page,
}, info) => {
  await signInAs(page.context(), accountFor('replay', info.project.name));
  await routeJourney(page, info.project.name, { plan: null, handoff: null });

  await page.goto(`/runs/${replayRunId(info.project.name)}`);

  await expect(journey(page).getByRole('listitem')).toHaveCount(7);
  await expect(stepOf(page, 'Understand')).toContainText('Done');
  await expect(journey(page).locator('.rst-road__detail').first()).toBeHidden();
  // One row of seven where they fit; where the navigation narrows the strip, 4 + 3 rather than a broken word.
  for (const [width, rows] of [
    [1280, 1],
    [1024, 2],
  ] as const) {
    await page.setViewportSize({ width, height: 800 });
    expect(await rowsOf(page)).toBe(rows);
    await expectNoSidewaysScroll(page);
  }
  await expectPhoneFits(page);

  const collapsedHeight = (await journey(page).boundingBox())?.height ?? 0;
  await showStepDetails(page);
  await expect(journey(page).locator('.rst-road__detail').first()).toBeVisible();
  expect((await journey(page).boundingBox())?.height ?? 0).toBeGreaterThan(collapsedHeight);
  await journey(page).getByRole('button', { name: 'Hide step details' }).click();
  await expect(journey(page).locator('.rst-road__detail').first()).toBeHidden();
  await transitionsDone(page);
  await expectNoSeriousViolations(page);
});
