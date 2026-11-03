import type { Page } from '@playwright/test';
import { expectNoSeriousViolations } from './support/axe.js';
import { openScannedStartPage } from './support/cost-run.js';
import { expect, test } from './support/fixtures.js';
import { accountFor } from './support/seed.js';
import { signInAs } from './support/sign-in.js';

// RF-1021, RF-1020, RF-1022, DEC-211 (P8-26, P8Project): the project page in its three states, on the
// real page, its CSS and the real server. The project is real (scanned); the facts of its journey
// and its runs are replaced, as the page reads them from `GET /api/projects/:id/journey` and
// `.../history`, so each state is reached without running a model.

test.beforeEach(async ({ context }, info) => {
  await signInAs(context, accountFor('start-run', info.project.name));
});

const run = (id: string, queueState: string, endState: string | null) => ({
  ...{ id, runId: `20261103-0925-${id}`, stage: 'understand', queueState, endState },
  ...{
    commitSha: null,
    queuedAt: '2026-11-03T09:25:00.000Z',
    startedAt: '2026-11-03T09:25:01.000Z',
  },
  ...{ endedAt: endState === null ? null : '2026-11-03T09:27:01.000Z' },
  ...{ totals: { costMicros: 120_000, inputTokens: 1, outputTokens: 1, cachedInputTokens: 0 } },
  ...{ sizeBytes: 1, failedAreas: 0, unreadAreas: 0, position: null },
});

const journey = (over: Record<string, unknown>) => ({
  scanRunId: '11111111-1111-4111-8111-111111111111',
  briefSaved: false,
  plan: null,
  handoff: null,
  source: {
    ...{ id: 'src-run', runKey: '20261103-0908-understand', queueState: 'Ended' },
    ...{ endState: 'Completed', endedAt: '2026-11-03T09:10:00.000Z', costMicros: 130_700 },
    ...{ errorCode: null, supportedClaims: 169, openQuestions: 3 },
    ...{ deepens: 1, isDeepen: false, deepening: false },
  },
  ...over,
});

async function showFacts(page: Page, facts: unknown, runs: readonly unknown[]): Promise<void> {
  await page.route('**/api/projects/*/journey', (route) => route.fulfill({ json: facts }));
  await page.route('**/api/projects/*/history', (route) =>
    route.fulfill({
      json: {
        project: {
          ...{ id: 'p', name: 'octo/demo', sourceUrl: '', ref: '', subpath: '' },
          ...{ folder: 'projects/p', sizeBytes: 1 },
        },
        runs,
      },
    }),
  );
  await page.reload();
}

test('RF-1021 before the first run the page is titled "Start a run" and starts one', async ({
  page,
}) => {
  await openScannedStartPage(page);

  await expect(page.getByRole('heading', { name: 'Start a run', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Analyse/u })).toBeVisible();
  await expect(page.getByText('Start another run')).toHaveCount(0);
  await expectNoSeriousViolations(page);
});

test('RF-1021 RF-1020 with questions waiting the page is titled with the project and the step', async ({
  page,
}) => {
  await openScannedStartPage(page);

  await showFacts(page, journey({}), [run('src-run', 'Ended', 'Completed')]);

  // The account's project keeps its own name: the title is that name, not "Start a run".
  const title = page.getByRole('heading', { level: 1 });
  await expect(title).not.toHaveText('Start a run');
  await expect(title).toHaveText(/^octo[/]/u);
  await expect(page.getByTestId('project-status')).toContainText(
    /Questions waiting|Deepen waiting/u,
  );
  await expect(page.getByRole('heading', { name: 'Start a run' })).toHaveCount(0);
  await expectNoSeriousViolations(page);
});

test('RF-1021 RF-1022 with the package written the page shows it, with nothing covering a control', async ({
  page,
}) => {
  await openScannedStartPage(page);
  const written = journey({
    briefSaved: true,
    plan: {
      ...{ id: 'plan-run', runKey: '20261103-0925-plan', queueState: 'Ended' },
      ...{ endState: 'Completed', endedAt: '2026-11-03T09:27:00.000Z', costMicros: 24_200 },
      errorCode: null,
    },
    handoff: { runId: 'plan-run', runKey: '20261103-0925-plan', outOfDate: false, gaps: false },
    budget: {
      approvedMicros: 4_000_000,
      remainingMicros: 3_850_000,
      approvedTokens: 0,
      remainingTokens: 0,
    },
  });

  await showFacts(page, written, [
    run('plan-run', 'Ended', 'Completed'),
    run('src-run', 'Ended', 'Completed'),
  ]);

  await expect(page.getByTestId('project-status')).toContainText('Package ready');
  await expect(page.getByRole('heading', { name: 'Hand-off package' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Download hand-off zip' })).toBeVisible();
  await expect(page.getByText('$3.85 left of $4.00 approved').first()).toBeVisible();
  await expect(page.getByRole('table', { name: 'Runs of this project' })).toBeVisible();
  await expect(page.getByLabel('Zip file')).toHaveCount(0);
  const another = page.getByTestId('start-another');
  await expect(another).not.toHaveAttribute('open', '');
  await another.getByText('Start another run').click();
  // The areas and Analyse open under it; the bar reserves its height, so the button is reachable.
  await expect(another.getByRole('button', { name: /^Analyse/u })).toBeVisible();
  await another.getByRole('button', { name: /^Analyse/u }).scrollIntoViewIfNeeded();
  await expectNoSeriousViolations(page);
});

test('RF-1020 RF-1021 a live Deepen is one click from the project page', async ({ page }) => {
  await openScannedStartPage(page);
  const deepening = journey({ source: { ...journey({}).source, deepening: true } });

  await showFacts(page, deepening, [
    run('live-deepen', 'Running', null),
    run('src-run', 'Ended', 'Completed'),
  ]);

  await page.getByTestId('project-status').getByRole('link', { name: 'Deepen running' }).click();
  await expect(page).toHaveURL(/\/runs\/live-deepen$/u);
});
