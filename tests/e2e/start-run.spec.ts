import type { Page } from '@playwright/test';
import { expect, test } from './support/fixtures.js';
import { expectNoSeriousViolations } from './support/axe.js';
import { accountFor } from './support/seed.js';
import { signInAs } from './support/sign-in.js';
import { transitionsDone } from './support/transitions.js';

// RF-1001, RF-143, RF-425, RF-1108, DEC-108, P1-34: the start page of a project, driven against
// the test server (fake GitHub for octo/demo, the answering provider for every model call). A scan
// and an understand run start from the page, the cloud notice needs its consent, a wrong address
// is refused next to its field, a likely estimate above the cap warns, and a queued run shows its
// position (the queue answer is made by the test: one run finishes before a second can wait on
// this server). The account belongs to the project (seed.ts); the steps run in order because they
// share its project and its runs.

const demoUrl = 'https://github.com/octo/demo';
const startButton = { name: /^Start run/u } as const;
const consent = 'I understand; send masked excerpts to OpenAI for this run';

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ context }, info) => {
  await signInAs(context, accountFor('start-run', info.project.name));
});

async function openStartPage(page: Page): Promise<void> {
  await page.goto('/projects');
  const link = page.getByRole('link', { name: 'Start run for octo/demo' });
  const empty = page.getByText('No projects yet');
  await expect(link.or(empty)).toBeVisible();
  if (await empty.isVisible()) {
    await page.getByLabel('GitHub repository URL').fill(demoUrl);
    await page.getByRole('button', { name: 'Create project' }).click();
  }
  await link.click();
  await expect(page.getByRole('heading', { name: 'Start a run', level: 1 })).toBeVisible();
  await expect(page.getByLabel('GitHub repository URL')).toHaveValue(demoUrl);
}

function projectIdOf(page: Page): string {
  const id = /\/projects\/([^/]+)\/start$/u.exec(new URL(page.url()).pathname)?.[1];
  if (id === undefined) throw new Error(`Not a start page: ${page.url()}`);
  return id;
}

test('RF-1001 starts a scan from the page before there is a code map and passes axe', async ({
  page,
}) => {
  await openStartPage(page);

  await expect(page.getByText(/Run a scan first/u)).toBeVisible();
  await expect(page.getByLabel('Understand')).toBeDisabled();
  await expect(page.getByLabel('Scan only')).toBeChecked();
  await expectNoSeriousViolations(page);
  await page.getByRole('button', startButton).click();

  await expect(page.getByTestId('run-notice')).toContainText('Run started');
  await expectNoSeriousViolations(page);
  const estimate = `/api/projects/${projectIdOf(page)}/estimate`;
  // The estimate answers once the scan has completed and left its code map.
  await expect
    .poll(async () => page.evaluate(async (path) => (await fetch(path)).status, estimate), {
      timeout: 30_000,
    })
    .toBe(200);
});

test('RF-1001 shows the estimate and starts an understand run for the chosen areas', async ({
  page,
}) => {
  await openStartPage(page);

  await expect(page.getByLabel('Understand')).toBeChecked();
  const table = page.getByRole('table', { name: 'Estimate per role' });
  await expect(table.getByRole('row', { name: /reader/u })).toBeVisible();
  await expect(table.getByRole('row', { name: /Total/u })).toBeVisible();
  await expect(page.getByText(/Code will leave this machine/u)).toHaveCount(0);
  const areas = page.getByRole('group', { name: 'Areas from the code map' }).getByRole('checkbox');
  expect(await areas.count()).toBeGreaterThan(0);
  await areas.first().uncheck();
  await page.getByRole('button', { name: 'Re-estimate' }).click();
  await expect(table).toBeVisible();
  await expectNoSeriousViolations(page);
  await areas.first().check();
  await page.getByRole('button', startButton).click();

  await expect(page.getByTestId('run-notice')).toContainText(/Run started|Queued/u);
  await expectNoSeriousViolations(page);
});

test('RF-143 a cloud reader needs the consent before Start and the notice names the provider', async ({
  page,
}) => {
  await openStartPage(page);
  await page.getByRole('link', { name: 'Project settings' }).click();
  await page.getByLabel('Reader provider', { exact: true }).selectOption('openai');
  await page.getByLabel('Reader model', { exact: true }).fill('gpt-5-nano');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByText('Settings saved.')).toBeVisible();
  await page.getByRole('link', { name: 'Start a run' }).click();

  const notice = page.getByRole('region', { name: 'Code will leave this machine' });
  await expect(notice).toContainText('OpenAI');
  const start = page.getByRole('button', startButton);
  await expect(start).toBeDisabled();
  await expect(start).toHaveText('Start run (confirm the OpenAI notice)');
  await expectNoSeriousViolations(page);
  await page.getByLabel(consent).check();
  await expect(start).toBeEnabled();
  await transitionsDone(page);
  await expectNoSeriousViolations(page);
  await start.click();

  await expect(page.getByTestId('run-notice')).toContainText(/Run started|Queued/u);
});

test('RF-1001 a likely estimate above the run cap warns, names the cap and Start stays available', async ({
  page,
}) => {
  await openStartPage(page);
  await page.getByLabel(consent).check();

  await page.getByLabel('Run cap (USD)').fill('0.000001');

  const warning = page.getByTestId('cap-warning');
  await expect(warning).toContainText('run cap');
  await expect(warning).toContainText('$0.000001');
  await expect(page.getByRole('button', startButton)).toBeEnabled();
  await transitionsDone(page);
  await expectNoSeriousViolations(page);
});

test('RF-1001 an invalid address is refused next to the field with its code and starts nothing', async ({
  page,
}) => {
  await openStartPage(page);
  await page.getByLabel('Scan only').check();
  const url = page.getByLabel('GitHub repository URL');

  await url.fill('https://example.com/octo/demo');
  await page.getByRole('button', startButton).click();

  await expect(page.getByTestId('field-error').filter({ hasText: 'RST-1900' })).toBeVisible();
  await expect(url).toHaveAttribute('aria-invalid', 'true');
  await expect(url).toBeFocused();
  await expect(page.getByTestId('run-notice')).toHaveCount(0);
  await expectNoSeriousViolations(page);
});

test('RF-1108 a queued run shows its position and can be cancelled', async ({ page }) => {
  await page.route('**/api/projects/*/runs', async (route) => {
    await route.fulfill({
      status: 202,
      contentType: 'application/json',
      body: JSON.stringify({
        ...{ id: 'r-1', projectId: 'p-1', runId: '20261012-100000-scan', stage: 'scan' },
        ...{ queueState: 'Queued', endState: null, queuedAt: '2026-10-12T10:00:00.000Z' },
        ...{ startedAt: null, endedAt: null, commitSha: null, position: 2 },
        totals: { costMicros: 0, inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 },
      }),
    });
  });
  await page.route('**/api/runs/20261012-100000-scan/stop', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ runId: '20261012-100000-scan', queueState: 'Ended' }),
    });
  });
  await openStartPage(page);
  await page.getByLabel('Scan only').check();

  await page.getByRole('button', startButton).click();

  const notice = page.getByTestId('run-notice');
  await expect(notice).toContainText('Queued');
  await expect(notice).toContainText('position 2');
  await expectNoSeriousViolations(page);
  await notice.getByRole('button', { name: 'Cancel queued run' }).click();
  await expect(notice).toContainText('cancelled');
});
