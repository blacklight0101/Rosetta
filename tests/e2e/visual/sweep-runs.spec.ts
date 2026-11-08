import type { Page } from '@playwright/test';
import { gotoWithoutScripts } from '../support/axe.js';
import { expect, test } from '../support/fixtures.js';
import {
  confirmation,
  openHistory,
  rowMenuItem,
  runRow,
  runsTable,
} from '../support/history-page.js';
import { buildReport } from '../support/journey-pages.js';
import { openSettingsFromList } from '../support/projects-list.js';
import { expectRowMenuWorks } from '../support/row-menu.js';
import {
  agentPanel,
  openRunTab,
  openScanRun,
  openStartPage,
  runStatus,
  startUnderstand,
  RUN_DONE,
} from '../support/live-run-page.js';
import { expectOptions, openPlanSetup, openStep } from '../support/plan-setup-page.js';
import { accountFor } from '../support/seed.js';
import { signInAs } from '../support/sign-in.js';
import { expectNoMidWordBreak, expectPageInView } from '../support/sweep.js';

// RNF-010, RF-010, RF-002, RF-1001, RF-1002, RF-1008, RF-1010, RF-1011, RF-504, RF-506,
// architecture.md section 17: the visual sweep of the pages of a project and its runs, in all four
// projects (@visual). The `sweep` account of the project makes `octo/webforms` (the C# fixture whose
// recorded run the test server replays), scans it and understands the Catalog area, so every page
// shows real data: projects, start, live run, API calls and logs, history, cost, Plan setup, project settings,
// the run with its report built, the report and the replay with and without its script. Each page
// follows the colour scheme, passes axe and never scrolls sideways, at 360 px either (verdict on
// #268). The steps run in order because they share the project and its runs.

test.describe.configure({ mode: 'serial' });

/** The live page of the finished understand run (`/runs/<uuid>`). */
let understandRun = '';

async function linkTarget(page: Page, name: string): Promise<string> {
  const href = await page.getByRole('link', { name, exact: true }).getAttribute('href');
  if (href === null) throw new Error(`The link ${name} has no address.`);
  return href;
}

/** Every test of the sweep runs in all four projects (playwright.config.ts). */
const visual = { tag: '@visual' };

test.beforeEach(async ({ context }, info) => {
  await signInAs(context, accountFor('sweep', info.project.name));
});

test(
  'RNF-010 projects without a project, the start page before a scan and a finished scan',
  visual,
  async ({ page }) => {
    await page.goto('/projects');
    await expect(page.getByText('No projects yet')).toBeVisible();
    await expectPageInView(page);

    await openStartPage(page, 'scanning');
    await expect(page.getByTestId('scan-running')).toBeVisible();
    await expectPageInView(page);

    await openScanRun(page);
    await expect(page.getByRole('region', { name: 'Code map' })).toBeVisible();
    await expectPageInView(page);
  },
);

test(
  'RNF-010 the start page with its estimate and a finished understand run',
  visual,
  async ({ page }) => {
    test.setTimeout(120_000);
    await openStartPage(page);
    await expect(page.getByRole('table', { name: 'Estimate per role' })).toBeVisible();
    await expectPageInView(page);

    understandRun = await startUnderstand(page, ['Catalog']);
    await expect(runStatus(page)).toContainText(RUN_DONE, { timeout: 60_000 });
    await expect(page.getByRole('region', { name: 'Overview of the application' })).toBeVisible();
    await expectPageInView(page);
    await openRunTab(page, 'Your questions');
    await expectPageInView(page);
    await openRunTab(page, 'Evidence');
    await expect(agentPanel(page, 'Catalog')).toContainText('BR-001');
    await expect(page.getByRole('region', { name: 'Claims' }).getByTestId('claim')).not.toHaveCount(
      0,
    );
    await expectPageInView(page);
    await openRunTab(page, 'Activity');
    await expectPageInView(page);
  },
);

test('RNF-010 the API calls and logs of the run', visual, async ({ page }) => {
  await page.goto(`${understandRun}/calls`);
  await expect(page.getByRole('heading', { name: 'API calls and logs', level: 1 })).toBeVisible();
  await expect(page.getByTestId('call-row').first()).toBeVisible();

  await expectPageInView(page);
});

test('RNF-010 the history with its runs and the delete confirmation', visual, async ({ page }) => {
  await openHistory(page);
  const row = runRow(page, '-understand');
  await expect(row).toContainText('Partly read');
  // P8-130: the share of the row is a real one (the server works it out), the one of the run page.
  const share = /(\d+)% of your code/u.exec(await row.innerText())?.[1];
  expect(share, 'the row names the share of code read').toBeDefined();
  // RF-231: the coverage of the run is part of the page that must fit (P2-41, P8-89).
  await expect(row.getByTestId('run-coverage')).toBeVisible();
  await expectPageInView(page);

  await expectRowMenuWorks(page, row.getByRole('button', { name: /^More actions for run / }));
  await (await rowMenuItem(row, 'Delete')).click();
  await expect(confirmation(page)).toContainText('This cannot be undone.');

  await expectPageInView(page);
  await page.keyboard.press('Escape');
  await expect(confirmation(page)).toHaveCount(0);

  await page.goto(understandRun);
  await expect(runStatus(page)).toContainText(`Partly read: ${share ?? ''}% of your code`);
});

test(
  'RNF-010 RF-1008 the history at 1024 px does not scroll the page sideways and reaches every More actions',
  visual,
  async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 800 });
    await openHistory(page);
    await expect(runRow(page, '-understand')).toContainText('Partly read');
    // The page never scrolls sideways (the hidden "Actions" header sat outside the box that scrolls).
    await expectPageInView(page);

    // The table is wider than its box at 1024 px and scrolls inside it (design-system.md section 8):
    // each row's button comes into view, inside the viewport, by scrolling that box.
    for (const button of await runsTable(page)
      .getByRole('button', { name: /^More actions for run / })
      .all()) {
      await button.scrollIntoViewIfNeeded();
      const box = await button.boundingBox();
      expect((box?.x ?? 2000) + (box?.width ?? 0)).toBeLessThanOrEqual(1024);
    }
  },
);

test('RNF-010 the cost page of the project', visual, async ({ page }) => {
  await openStartPage(page);
  await page.getByRole('navigation').getByRole('link', { name: 'Cost' }).click();
  await expect(page.getByRole('heading', { name: 'Project cost', level: 1 })).toBeVisible();
  await expect(page.getByRole('table', { name: 'By run' }).getByRole('link')).not.toHaveCount(0);

  await expectPageInView(page);
});

test(
  'RNF-010 Plan setup with its options, the recorded summary and the estimate',
  visual,
  async ({ page }) => {
    await openStartPage(page);
    await openPlanSetup(page);
    await expectPageInView(page);

    await openStep(page, 'Architecture');
    await expectOptions(page);
    await expectPageInView(page);

    await openStep(page, 'Stack');
    await expect(page.getByRole('radiogroup').first().getByRole('radio')).toHaveCount(3, {
      timeout: 20_000,
    });
    await expectPageInView(page);

    await openStep(page, 'Project context');
    await expectPageInView(page);
  },
);

test('RNF-010 projects with the run columns and the project settings', visual, async ({ page }) => {
  await page.goto('/projects');
  // P8-137: after a finished understand run the row says what the project page says beside its title.
  await expect(page.getByRole('row').filter({ hasText: 'octo/webforms' })).toContainText(
    /Deepen waiting|Questions waiting|Plan setup waiting|Estimate waiting|Nothing to plan from/u,
  );
  await expectPageInView(page);

  await openSettingsFromList(page, 'octo/webforms');
  await expect(page.getByRole('heading', { name: 'Project settings' })).toBeVisible();

  await expectPageInView(page);
});

test(
  'RNF-010 the run with its report built, the report and the replay with and without its script',
  visual,
  async ({ page }) => {
    await page.goto(understandRun);
    await expect(runStatus(page)).toContainText(RUN_DONE);
    await buildReport(page);
    await expectPageInView(page);
    const report = await linkTarget(page, 'Open the report');
    const replay = await linkTarget(page, 'Open the run replay');

    await page.goto(report);
    await expect(page.getByRole('heading', { name: 'Run report', level: 1 })).toBeVisible();
    await expectPageInView(page, 'static');
    // P1-151: a card title may carry long words; set one in the Cards table and check it breaks
    // only at word boundaries, at every width (the phone projects see the narrow cells).
    await page.evaluate(`(() => {
      const title = document.querySelector('[aria-label="Cards of the run"] tbody tr td:last-child');
      if (title !== null) title.textContent = 'Internationalization Authentication CitationInvalid';
    })()`);
    await expectNoMidWordBreak(page);
    await page.goto(replay);
    await expect(page.getByRole('heading', { name: 'Run replay', level: 1 })).toBeVisible();
    await expectPageInView(page, 'static');
    await gotoWithoutScripts(page, replay);
    await expect(page.getByRole('button', { name: 'Play' })).toHaveCount(0);

    await expectPageInView(page, 'static');
  },
);
