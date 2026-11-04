import type { Locator, Page } from '@playwright/test';
import { expect, test } from './support/fixtures.js';
import { expectNoSeriousViolations } from './support/axe.js';
import { openScannedStartPage } from './support/cost-run.js';
import {
  agentPanel,
  openRunTab,
  openScanRun,
  openStartPage,
  runStatus,
  startUnderstand,
  valueOf,
  RUN_DONE,
} from './support/live-run-page.js';
import { accountFor } from './support/seed.js';
import { signInAs } from './support/sign-in.js';
import { transitionsDone } from './support/transitions.js';

// RF-1002, RF-1003, RF-424, RF-1010, DEC-49, design-system.md section 1 (principle 6) and section 5
// (P1-95): the stage stepper, Pause updates and the "This run" meter of the top bar on the live run
// page. The runs are real runs of the test server: the model double replays the recorded understand
// run of the C# fixture (e2e-provider.ts) and nothing of the API or the event stream is replaced.
// The steps share one project and one run at a time, so they run in order. The top bar test also
// checks the 360 px layout (@phone).

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ context }, info) => {
  await signInAs(context, accountFor('live-controls', info.project.name));
});

const pipeline = (page: Page): Locator => page.getByRole('list', { name: 'Pipeline' });
const step = (page: Page, name: string): Locator =>
  pipeline(page).getByRole('listitem').filter({ hasText: name });
const runMeter = (page: Page): Locator =>
  page.getByRole('banner').getByRole('meter', { name: 'This run spent against cap' });
/** Where an element is on the page: nothing may move when Pause updates is pressed or released. */
async function boxOf(
  locator: Locator,
): Promise<{ x: number; y: number; width: number; height: number }> {
  // The box in page coordinates: a scroll between two reads must not count as a move.
  await expect(locator).toBeVisible();
  return locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      x: rect.x + window.scrollX,
      y: rect.y + window.scrollY,
      width: rect.width,
      height: rect.height,
    };
  });
}

const pauseCount = (page: Page): Locator => page.getByTestId('pause-count');

/** The number in the pause counter ("12 events waiting"); 0 when the counter is not shown. */
async function waitingEvents(page: Page): Promise<number> {
  const shown = await pauseCount(page)
    .textContent({ timeout: 1000 })
    .catch(() => null);
  return Number(/(\d+) events? waiting/u.exec(shown ?? '')?.[1] ?? 0);
}

test('RF-1002 RF-1015 the stepper of a scan run goes from the snapshot to the scan with its files and areas and has no understand or verify step', async ({
  page,
}) => {
  await openStartPage(page);
  await openScanRun(page);
  await expect(pipeline(page)).toBeVisible();
  await expect(step(page, 'Scan')).toContainText(/\d+ files, \d+ areas/u);
  await expect(step(page, 'Snapshot')).toContainText('done');
  await expect(step(page, 'Scan')).toContainText('done');
  // P8-27: a scan has no understand or verify step to show as an empty circle.
  await expect(pipeline(page).getByRole('listitem')).toHaveCount(2);
  await expect(step(page, 'Understand')).toHaveCount(0);
  await expect(step(page, 'Verify')).toHaveCount(0);
  await expect(step(page, 'Report')).toHaveCount(0);
  await expect(pipeline(page).locator('[aria-current="step"]')).toHaveCount(0);
  await transitionsDone(page);
  await expectNoSeriousViolations(page);
});

test('RF-1002 RF-504 P8-11 the Report step of an ended run is absent until the report is built from the page, appears done at once and is done on load', async ({
  page,
}) => {
  // P8-27 (RF-1015): a scan has no report, so the report is built from an ended understand run.
  test.setTimeout(120_000);
  await openStartPage(page);
  await openScanRun(page);
  await startUnderstand(page, ['Catalog']);
  await expect(runStatus(page)).toContainText(RUN_DONE, { timeout: 60_000 });
  const build = page.getByRole('button', { name: 'Build report' });
  await expect(build).toBeEnabled();
  await expect(step(page, 'Report')).toHaveCount(0);
  // A reload would load the page again: the step must turn done on this same page.
  let loads = 0;
  page.on('load', () => {
    loads += 1;
  });

  await build.click();

  await expect(page.getByRole('link', { name: 'Open the run replay' })).toBeVisible();
  await expect(step(page, 'Report')).toContainText('done');
  expect(loads).toBe(0);
  await expect(pipeline(page).locator('[aria-current="step"]')).toHaveCount(0);

  await page.reload();

  await expect(step(page, 'Report')).toContainText('done');
  await expect(step(page, 'Report')).toHaveAttribute('data-state', 'done');
  await transitionsDone(page);
  await expectNoSeriousViolations(page);
});

test('RF-1002 RF-1004 the journey of an understand run reads while it runs and the stepper ends with the agents done and the claims checked', async ({
  page,
}) => {
  await startUnderstand(page, ['(root)', 'Catalog', 'Database', 'Services']);

  const journey = page.getByRole('list', { name: 'Run progress' });
  await expect(journey.getByRole('listitem')).toHaveText([
    /Map the code/u,
    /Read/u,
    /Check citations/u,
    /Explain/u,
    /Your questions/u,
  ]);
  const read = journey.getByRole('listitem').filter({ hasText: /Read\d/u });
  await expect(read).toHaveAttribute('aria-current', 'step', { timeout: 30_000 });
  await expect(journey.getByRole('listitem').first()).toContainText('done');
  await expect(read).toContainText(/\d of 5 areas/u);
  await expectNoSeriousViolations(page);
  await transitionsDone(page);

  await expect(runStatus(page)).toContainText(RUN_DONE, { timeout: 60_000 });
  await expect(step(page, 'Understand')).toContainText('4 of 4 agents done');
  await expect(step(page, 'Understand')).toContainText('done');
  await expect(step(page, 'Verify')).toContainText('7 of 7 citations checked, 5 judged');
  await expect(step(page, 'Verify')).not.toContainText(/later version|waiting for judgement/u);
  await expect(step(page, 'Verify')).toContainText('done');
  await expect(step(page, 'Report')).toHaveCount(0);
  await expect(pipeline(page).locator('[aria-current="step"]')).toHaveCount(0);
  await transitionsDone(page);
  await expectNoSeriousViolations(page);
});

test('RF-1002 Pause updates holds the panels, the overview and the log while the counter rises, and Resume applies the held events', async ({
  page,
}) => {
  await startUnderstand(page, ['Catalog', 'Controllers']);
  await openRunTab(page, 'All agents');
  await expect(agentPanel(page, 'Catalog')).toBeVisible();
  const overview = page.getByRole('region', { name: 'Overview' });
  const log = page.getByRole('log', { name: 'Event log' });

  const pauseBox = await boxOf(page.getByRole('button', { name: 'Pause updates' }));
  await page.getByRole('button', { name: 'Pause updates' }).click();

  await expect(page.getByRole('button', { name: 'Resume', exact: true })).toBeVisible();
  expect(await boxOf(page.getByRole('button', { name: 'Resume', exact: true }))).toEqual(pauseBox);
  await expect(runStatus(page)).toContainText('Updates paused');
  const held = {
    catalog: (await agentPanel(page, 'Catalog').textContent()) ?? '',
    done: (await valueOf(overview, 'Done').textContent()) ?? '',
    lines: 0,
  };
  await expect.poll(() => waitingEvents(page), { timeout: 30_000 }).toBeGreaterThan(2);
  expect(await agentPanel(page, 'Catalog').textContent()).toBe(held.catalog);
  await expect(valueOf(overview, 'Done')).toHaveText(held.done);
  await openRunTab(page, 'Activity');
  held.lines = await log.getByRole('listitem').count();
  await expect(log.getByRole('listitem')).toHaveCount(held.lines);
  await expect(page.getByRole('button', { name: 'Stop run' })).toBeEnabled();
  await transitionsDone(page);
  await expectNoSeriousViolations(page);

  await page.getByRole('button', { name: 'Resume', exact: true }).click();

  await expect(pauseCount(page)).toHaveCount(0);
  await expect(runStatus(page)).toContainText('Updates resumed');
  expect(await boxOf(page.getByRole('button', { name: 'Pause updates' }))).toEqual(pauseBox);
  await expect(page.getByRole('button', { name: 'Pause updates' })).toBeVisible();
  await expect
    .poll(() => log.getByRole('listitem').count(), { timeout: 30_000 })
    .toBeGreaterThan(held.lines);
  await openRunTab(page, 'All agents');
  await expect(agentPanel(page, 'Catalog')).toContainText('Done', { timeout: 30_000 });
  await page.getByRole('button', { name: 'Stop run' }).click();
  await expect(runStatus(page)).toContainText('Stopped by you', { timeout: 30_000 });
  await openRunTab(page, 'Activity');
  await expect(log.getByRole('listitem').first()).toContainText('run.ended');
  await expectNoSeriousViolations(page);
});

test('RF-1002 pressing Pause updates and Resume moves neither the button nor the panels', async ({
  page,
}) => {
  await startUnderstand(page, ['Controllers']);
  await openRunTab(page, 'All agents');
  await expect(agentPanel(page, 'Controllers')).toContainText('Running', { timeout: 30_000 });
  // The estimate and the role rows of the live meter above the panel arrive on their own; wait for them so the panel is at rest.
  const meter = page.getByRole('region', { name: 'Run meter' });
  await expect(meter).toContainText('Estimate', { timeout: 30_000 });
  await expect(meter.getByRole('row', { name: /reader/u })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pause updates' })).toBeVisible();
  const before = {
    button: await boxOf(page.getByRole('button', { name: 'Pause updates' })),
    panel: await boxOf(agentPanel(page, 'Controllers')),
  };

  await page.getByRole('button', { name: 'Pause updates' }).click();
  await expect(runStatus(page)).toContainText('Updates paused');

  expect(await boxOf(page.getByRole('button', { name: 'Resume', exact: true }))).toEqual(
    before.button,
  );
  expect(await boxOf(agentPanel(page, 'Controllers'))).toEqual(before.panel);
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await expect(runStatus(page)).toContainText('Updates resumed');
  expect(await boxOf(page.getByRole('button', { name: 'Pause updates' }))).toEqual(before.button);
  expect(await boxOf(agentPanel(page, 'Controllers'))).toEqual(before.panel);
  await page.getByRole('button', { name: 'Stop run' }).click();
  await expect(runStatus(page)).toContainText('Stopped by you', { timeout: 30_000 });
});

test('RF-1003 Stop run ends a run whose updates are paused, and Resume then shows how it ended', async ({
  page,
}) => {
  await startUnderstand(page, ['Catalog', 'Controllers']);
  await openRunTab(page, 'All agents');
  // Catalog reads and then answers, so Controllers (whose reader is held) starts a moment later.
  await expect(agentPanel(page, 'Controllers')).toContainText('Running', { timeout: 30_000 });
  await page.getByRole('button', { name: 'Pause updates' }).click();
  const held = (await agentPanel(page, 'Controllers').textContent()) ?? '';

  // No event is waiting yet: Catalog has ended and Controllers is held, so nothing happens until
  // Stop. Polling for waiting events here would only wait for something that cannot come (it was
  // the poll that stopped the run before Controllers started, once Catalog took two calls).
  await page.getByRole('button', { name: 'Stop run' }).click();

  await expect(runStatus(page)).toContainText('Stopped by you', { timeout: 30_000 });
  await expect.poll(() => waitingEvents(page), { timeout: 30_000 }).toBeGreaterThan(0);
  await openRunTab(page, 'Evidence');
  expect(await agentPanel(page, 'Controllers').textContent()).toBe(held);
  await page.getByRole('button', { name: 'Resume', exact: true }).click();
  await expect(pauseCount(page)).toHaveCount(0);
  await expect(agentPanel(page, 'Controllers')).not.toHaveText(held);
  await openRunTab(page, 'Activity');
  const log = page.getByRole('log', { name: 'Event log' });
  await expect(log.getByRole('listitem').first()).toContainText('run.ended');
});

test(
  'RF-1003 RF-1010 the top bar shows what the run spent against its cap while the run is active and drops the meter when it ends',
  { tag: '@phone' },
  async ({ page }) => {
    // @phone: phone-light runs this test on its own, so it scans first when the project has none.
    test.setTimeout(90_000);
    await openScannedStartPage(page);
    await startUnderstand(page, ['Catalog', 'Controllers']);
    await openRunTab(page, 'All agents');

    const group = page.getByTestId('topbar-run-meter');
    await expect(group).toBeVisible({ timeout: 30_000 });
    // P8-24: the run is a step of a journey, so the meter shows the approved amount left, not a cap.
    // P5-07: the e2e project reads on Ollama, so the amount is counted in tokens.
    await expect(group).toContainText(/[\d,]+ tokens left of [\d,]+ approved/u);
    await expect(group).not.toContainText('This run');
    await expect(group).not.toContainText('$');
    await expect(runMeter(page)).toHaveAttribute('aria-valuenow', /^\d+$/u);
    await expect(runMeter(page)).toHaveAttribute(
      'aria-valuetext',
      /^[\d,]+ tokens left of [\d,]+ approved \(\d+%\)/u,
    );
    await expect(page.getByTestId('header-totals')).toBeVisible();
    const meterBox = await boxOf(group);
    await expect(agentPanel(page, 'Catalog')).toContainText('Done', { timeout: 30_000 });
    await expect(page.getByTestId('header-totals')).toContainText(/[1-9][0-9,]* tokens/u);
    expect((await boxOf(group)).x).toBe(meterBox.x);
    const fits = await page.evaluate(
      'document.documentElement.scrollWidth <= document.documentElement.clientWidth',
    );
    expect(fits).toBe(true);
    await transitionsDone(page);
    await expectNoSeriousViolations(page);

    await page.getByRole('button', { name: 'Stop run' }).click();

    await expect(runStatus(page)).toContainText('Stopped by you', { timeout: 30_000 });
    await expect(group).toHaveCount(0);
    await expect(page.getByTestId('header-totals')).toBeVisible();
    await expectNoSeriousViolations(page);
  },
);
