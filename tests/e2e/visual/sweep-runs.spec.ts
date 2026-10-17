import type { Page } from '@playwright/test';
import { gotoWithoutScripts } from '../support/axe.js';
import { expect, test } from '../support/fixtures.js';
import { confirmation, openHistory, runRow } from '../support/history-page.js';
import { buildReport } from '../support/journey-pages.js';
import {
  agentPanel,
  openRunTab,
  openStartPage,
  runStatus,
  startAndOpenLiveRun,
  startUnderstand,
} from '../support/live-run-page.js';
import { accountFor } from '../support/seed.js';
import { signInAs } from '../support/sign-in.js';
import { expectNoMidWordBreak, expectPageInView } from '../support/sweep.js';

// RNF-010, RF-010, RF-002, RF-1001, RF-1002, RF-1008, RF-1010, RF-1011, RF-504, RF-506,
// architecture.md section 17: the visual sweep of the pages of a project and its runs, in all four
// projects (@visual). The `sweep` account of the project makes `octo/webforms` (the C# fixture whose
// recorded run the test server replays), scans it and understands the Catalog area, so every page
// shows real data: projects, start, live run, API calls and logs, history, cost, project settings,
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

    await openStartPage(page);
    await expect(page.getByText(/Run a scan first/u)).toBeVisible();
    await expectPageInView(page);

    await page.getByLabel('Scan only').check();
    await startAndOpenLiveRun(page);
    await expect(runStatus(page)).toContainText('Completed', { timeout: 60_000 });
    await expect(page.getByText('This run has no agents')).toBeVisible();
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
    await expect(runStatus(page)).toContainText('Completed', { timeout: 60_000 });
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
  await expect(row).toContainText('Completed');
  await expectPageInView(page);

  await row.getByRole('button', { name: /^Delete:/u }).click();
  await expect(confirmation(page)).toContainText('This cannot be undone.');

  await expectPageInView(page);
  await page.keyboard.press('Escape');
  await expect(confirmation(page)).toHaveCount(0);
});

test('RNF-010 the cost page of the project', visual, async ({ page }) => {
  await openStartPage(page);
  await page.getByRole('navigation').getByRole('link', { name: 'Cost' }).click();
  await expect(page.getByRole('heading', { name: 'Project cost', level: 1 })).toBeVisible();
  await expect(page.getByRole('table', { name: 'By run' }).getByRole('link')).not.toHaveCount(0);

  await expectPageInView(page);
});

test('RNF-010 projects with the run columns and the project settings', visual, async ({ page }) => {
  await page.goto('/projects');
  await expect(page.getByRole('row').filter({ hasText: 'octo/webforms' })).toContainText(
    'Completed',
  );
  await expectPageInView(page);

  await page.getByRole('link', { name: 'Settings for octo/webforms' }).click();
  await expect(page.getByRole('heading', { name: 'Project settings' })).toBeVisible();

  await expectPageInView(page);
});

test(
  'RNF-010 the run with its report built, the report and the replay with and without its script',
  visual,
  async ({ page }) => {
    await page.goto(understandRun);
    await expect(runStatus(page)).toContainText('Completed');
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
