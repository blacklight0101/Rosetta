import type { Page } from '@playwright/test';
import { expectNoSeriousViolations } from './support/axe.js';
import { openScannedStartPage } from './support/cost-run.js';
import { expect, test } from './support/fixtures.js';
import { accountFor } from './support/seed.js';
import { signInAs } from './support/sign-in.js';
import { showStartChoices } from './support/start-choices.js';
import { z } from 'zod';

// RF-1021, RF-1020, RF-1022, DEC-211 (P8-26, P8Project): the project page in its three states, on the
// real page, its CSS and the real server. The project is real (scanned); the facts of its journey
// and its runs are replaced, as the page reads them from `GET /api/projects/:id/journey` and
// `.../history`, so each state is reached without running a model. P8-105: the layout checks (nothing
// covered by the summary bar, no break inside a name) run at 1280x800 and at 360x780 on the real CSS.

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

const written = (over: Record<string, unknown> = {}) =>
  journey({
    briefSaved: true,
    plan: {
      ...{ id: 'plan-run', runKey: '20261103-0925-plan', queueState: 'Ended' },
      ...{ endState: 'Completed', endedAt: '2026-11-03T09:27:00.000Z', costMicros: 24_200 },
      errorCode: null,
    },
    handoff: { runId: 'plan-run', runKey: '20261103-0925-plan', outOfDate: false, gaps: false },
    ...over,
  });

const writtenRuns = [run('plan-run', 'Ended', 'Completed'), run('src-run', 'Ended', 'Completed')];

/** The control's box and the summary bar's box, after the control was scrolled to the end of the window. */
const controlAndBar = `(() => {
  const fold = document.querySelector('[data-testid="start-another"]');
  const bar = document.querySelector('.rst-start__bar');
  const visible = (each) => each.getClientRects().length > 0 && each.type !== 'hidden';
  const found = fold.querySelectorAll('button, a[href], input, select, textarea, summary');
  const controls = [...found].filter((each) => !bar.contains(each) && visible(each));
  const last = controls[controls.length - 1];
  last.scrollIntoView({ block: 'end' });
  return new Promise((done) => requestAnimationFrame(() => {
    const c = last.getBoundingClientRect();
    const b = bar.getBoundingClientRect();
    done([c.top, c.bottom, c.left, c.right, b.top, b.bottom, b.left, b.right, window.innerHeight]);
  }));
})()`;

/** The words of the matching elements that wrap onto two lines, so the page broke inside them. */
const brokenWordsIn = (selector: string): string => `(() => {
  const broken = [];
  for (const element of document.querySelectorAll(${JSON.stringify(selector)})) {
    const texts = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    for (let node = texts.nextNode(); node !== null; node = texts.nextNode()) {
      for (const word of node.data.matchAll(/[A-Za-z0-9]+/g)) {
        const range = document.createRange();
        range.setStart(node, word.index);
        range.setEnd(node, word.index + word[0].length);
        const tops = new Set([...range.getClientRects()].map((box) => Math.round(box.top)));
        if (tops.size > 1) broken.push(word[0]);
      }
    }
  }
  return broken;
})()`;

/** For each matching element, the number of lines its text takes. */
const lineCountsIn = (selector: string): string => `(() =>
  [...document.querySelectorAll(${JSON.stringify(selector)})].map(
    (element) => new Set([...element.getClientRects()].map((box) => Math.round(box.top))).size,
  ))()`;

const n = z.number();
/** control top, bottom, left, right; bar top, bottom, left, right; window height. */
const boxesSchema = z.tuple([n, n, n, n, n, n, n, n, n]);

const longName =
  'octo/customer-onboarding-service-pipelines-and-deployment-templates-for-regional-releases';

const longArea =
  'Services/CustomerOnboarding/RegionalReleases/DeploymentTemplates/PipelineOrchestration';
// Long words between few separators: a rule that breaks words cuts one at either width, where short
// words let the line end fall on a hyphen by chance (P8-126).
const longModel = 'multimodalreasoning-extendedcontext-windowrelease-candidate20261103';
const estimateBody = z.looseObject({ areas: z.array(z.unknown()), roles: z.array(z.unknown()) });

/** The real estimate with one long area name and long model names, so both wrap at their separators. */
async function longEstimate(page: Page): Promise<void> {
  await page.route('**/api/projects/*/estimate', async (route) => {
    const response = await route.fetch({ method: 'GET', postData: '' });
    if (!response.ok()) return route.fulfill({ response });
    const body = estimateBody.parse(await response.json());
    const area = { name: longArea, files: 3, thirdParty: false, estimatedTokens: 1000 };
    const roles = body.roles.map((role) => ({
      ...z.looseObject({}).parse(role),
      model: longModel,
    }));
    await route.fulfill({ response, json: { ...body, areas: [area], roles } });
  });
}

const sizes = [
  { name: '1280x800', size: { width: 1280, height: 800 } },
  { name: '360x780', size: { width: 360, height: 780 } },
] as const;

for (const { name, size } of sizes) {
  test(`RF-1021 RF-1022 at ${name} the last control of "Start another run" is not covered by the summary bar`, async ({
    page,
  }) => {
    await page.setViewportSize(size);
    await openScannedStartPage(page);
    await showFacts(page, written(), writtenRuns);
    await showStartChoices(page);
    await expect(
      page.getByTestId('start-another').getByRole('button', { name: /^Analyse/u }),
    ).toBeVisible();

    const boxes: unknown = await page.evaluate(controlAndBar);

    const [top, bottom, left, right, barTop, barBottom, barLeft, barRight, height] =
      boxesSchema.parse(boxes);
    expect(top).toBeGreaterThanOrEqual(0);
    expect(bottom).toBeLessThanOrEqual(height);
    const overlapsBar = bottom > barTop && top < barBottom && right > barLeft && left < barRight;
    expect(
      overlapsBar,
      `control ${String(top)}-${String(bottom)} bar ${String(barTop)}-${String(barBottom)}`,
    ).toBe(false);
  });

  test(`RF-1022 at ${name} a long project name, area name and model name do not break inside a word`, async ({
    page,
  }) => {
    await page.setViewportSize(size);
    await openScannedStartPage(page);
    await page.route(/[/]api[/]projects[/][^/?]+$/u, async (route) => {
      const real = z.record(z.string(), z.unknown()).parse(await (await route.fetch()).json());
      await route.fulfill({ json: { ...real, name: longName } });
    });
    await longEstimate(page);
    await showFacts(page, written(), writtenRuns);
    await showStartChoices(page);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(longName);
    // The check must never pass on zero elements: the picker and the table are there before it runs.
    const wrapped = page.locator('.rst-start__area-name, td.rst-table__wrap');
    await expect(wrapped.first()).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('.rst-start__area-name')).toHaveCount(1);
    await expect(page.locator('td.rst-table__wrap').first()).toBeVisible();
    // Every model name wraps at this width, so a rule that breaks words has words to break here too.
    const modelLines = z
      .array(n)
      .parse(await page.evaluate(lineCountsIn('td.rst-table__wrap .rst-mono')));
    expect(modelLines).not.toHaveLength(0);
    expect(
      Math.min(...modelLines),
      `lines of each model name ${JSON.stringify(modelLines)}`,
    ).toBeGreaterThanOrEqual(2);

    const title: unknown = await page.evaluate(brokenWordsIn('h1'));
    const areas: unknown = await page.evaluate(
      brokenWordsIn('.rst-start__area-name, td.rst-table__wrap'),
    );
    expect(await wrapped.count()).toBeGreaterThanOrEqual(2);

    expect(title).toEqual([]);
    expect(areas).toEqual([]);
  });
}
