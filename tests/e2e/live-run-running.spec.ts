import type { Locator, Page } from '@playwright/test';
import { expect, test } from './support/fixtures.js';
import { expectNoSeriousViolations } from './support/axe.js';
import { openScannedStartPage } from './support/cost-run.js';
import { agentPanel, openRunTab, runStatus, startUnderstand } from './support/live-run-page.js';
import { accountFor } from './support/seed.js';
import { signInAs } from './support/sign-in.js';
import { transitionsDone } from './support/transitions.js';

// RF-1015, RF-1016, RF-1003, RF-1010, RF-1011, RNF-010, DEC-137 (P1-169): the page of a run while it
// runs, driven by a real run of the test server. The model double replays the recorded understand
// run of the C# fixture (e2e-provider.ts): the `Catalog` reader finishes, the `Controllers` reader
// never answers until the run is stopped, so the run stays in the running mode while the page is
// looked at. The tests with a tag run in all four views (1280 and 360 px, light and dark).

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ context }, info) => {
  await signInAs(context, accountFor('live-running', info.project.name));
});

const tileOf = (page: Page, area: string): Locator =>
  page.getByRole('list', { name: 'Areas of the code' }).getByRole('button', { name: area });

/** Starts a run that stays running and opens its page; the caller stops it. */
async function startRunning(page: Page): Promise<void> {
  test.setTimeout(120_000);
  await openScannedStartPage(page);
  await startUnderstand(page, ['Catalog', 'Controllers']);
  await expect(page.getByRole('list', { name: 'Run progress' })).toBeVisible();
}

async function stopRun(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Stop run' }).click();
  await expect(runStatus(page)).toContainText('Interrupted', { timeout: 30_000 });
}

test(
  'RF-1015 RF-1016 the running page has the journey, the code map, the spend, the agents at work and three tabs',
  { tag: '@visual' },
  async ({ page }) => {
    await startRunning(page);

    const journey = page.getByRole('list', { name: 'Run progress' });
    await expect(journey.getByRole('listitem').first()).toContainText('done');
    await expect(journey.locator('[aria-current="step"]')).toContainText('Read', {
      timeout: 30_000,
    });
    await expect(tileOf(page, 'Controllers')).toContainText('being read', { timeout: 30_000 });
    await expect(tileOf(page, 'Catalog')).toContainText('read', { timeout: 30_000 });
    const now = page.getByRole('region', { name: 'Working now' });
    await expect(now).toContainText('Controllers');
    await expect(page.getByRole('region', { name: 'Spend for this run' })).toContainText('cap $');
    await expect(page.getByRole('tab')).toHaveText([
      /^Cards so far/u,
      /^All agents/u,
      /^Activity/u,
    ]);
    await expect(page.getByTestId('header-totals')).toBeVisible();
    const fits = await page.evaluate(
      'document.documentElement.scrollWidth <= document.documentElement.clientWidth',
    );
    expect(fits).toBe(true);
    await transitionsDone(page);
    await expectNoSeriousViolations(page);

    await stopRun(page);
  },
);

test('RF-1003 RF-1010 RF-1011 the cost per role, the estimate, the project totals and the calls are one click away', async ({
  page,
}) => {
  await startRunning(page);

  await page.getByRole('button', { name: 'Cost per role and estimate' }).click();
  const meter = page.getByRole('region', { name: 'Run meter' });
  await expect(meter).toContainText('Estimate', { timeout: 30_000 });
  await expect(meter.getByRole('row', { name: /reader/u })).toBeVisible();
  await expect(meter.getByRole('meter', { name: 'Run cost against cap' })).toBeVisible();
  await expect(page.getByTestId('header-totals')).toBeVisible();
  await openRunTab(page, 'Activity');
  await expect(page.getByRole('log', { name: 'Event log' })).toContainText('run.started');
  await expectNoSeriousViolations(page);
  const calls = page
    .getByRole('region', { name: 'Spend for this run' })
    .getByRole('link', { name: 'API calls and logs' });
  await calls.click();
  await expect(page.getByRole('heading', { name: 'API calls and logs', level: 1 })).toBeVisible();
  await page.goBack();

  await stopRun(page);
});

test('RF-1015 RF-1016 the tabs and the tiles work with the keyboard alone', async ({ page }) => {
  await startRunning(page);
  const cards = page.getByRole('tab', { name: /^Cards so far/u });
  await cards.focus();

  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: /^All agents/u })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.keyboard.press('End');
  await expect(page.getByRole('tab', { name: /^Activity/u })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.keyboard.press('Home');
  await expect(cards).toHaveAttribute('aria-selected', 'true');
  await tileOf(page, 'Controllers').focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('tab', { name: /^All agents/u })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await expect(agentPanel(page, 'Controllers')).toBeVisible();
  await expect(agentPanel(page, 'Catalog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Show all agents' }).click();
  await expect(agentPanel(page, 'Catalog')).toBeVisible();

  await stopRun(page);
});

test('RF-1016 nothing moves when the system asks for reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await startRunning(page);
  await expect(page.locator('.rst-tile--reading').first()).toBeVisible({ timeout: 30_000 });

  const animation = await page.evaluate(
    "getComputedStyle(document.querySelector('.rst-tile--reading'), '::after').animationName",
  );

  expect(animation).toBe('none');
  await stopRun(page);
});

test('RF-1105 a run id that is not the account own shows the error and no page of a run', async ({
  page,
}) => {
  await page.goto('/runs/00000000-0000-4000-8000-000000000000');

  await expect(page.getByTestId('error-banner')).toContainText('RST-2003');
  await expect(page.getByTestId('run-status')).toHaveCount(0);
  await expectNoSeriousViolations(page);
});
