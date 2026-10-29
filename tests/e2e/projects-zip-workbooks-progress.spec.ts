import type { Page, Route } from '@playwright/test';
import { buildZip } from '../support/zip-fixtures.js';
import { expect, test } from './support/fixtures.js';
import { expectNoSeriousViolations } from './support/axe.js';
import { accountFor } from './support/seed.js';
import { signInAs } from './support/sign-in.js';
import { discountsWorkbook, pricingWorkbook } from './support/workbook-fixtures-journey.js';

// RF-159, RF-128, RNF-010, DEC-188: the Upload a zip form with a zip that holds workbooks. The server
// accepts the zip at once and stores it after the request. The project, the upload and the batch are the
// real server's; a small zip is stored in a few milliseconds, too fast to see, so the answers of the
// state endpoints are scripted for as long as a test says (what a large zip would answer); once it lets
// go, the real state, with the real summary, comes through.

const STATE_PATH = /\/api\/projects\/[^/]+\/source\/batches\/[^/]+$/u;
const CURRENT_PATH = /\/api\/projects\/[^/]+\/source\/batches\/current$/u;

interface Script {
  /** While true the state endpoints answer a batch at work; afterwards the real server answers. */
  scripted: boolean;
}

const rendering = {
  step: 'rendering',
  workbook: 2,
  workbooks: 2,
  sheet: 1,
  sheets: 3,
  cells: 1200,
};

async function scriptState(page: Page, script: Script): Promise<void> {
  const processing = async (route: Route, batchId: unknown): Promise<void> => {
    await route.fulfill({
      json: { batchId, phase: 'processing', files: 1, elapsedMs: 7000, progress: rendering },
    });
  };
  await page.route(STATE_PATH, async (route: Route) => {
    if (route.request().method() !== 'GET' || !script.scripted) {
      await route.continue();
      return;
    }
    await processing(route, route.request().url().split('/').pop());
  });
  await page.route(CURRENT_PATH, async (route: Route) => {
    if (!script.scripted) {
      await route.continue();
      return;
    }
    const real = await route.fetch();
    const body: unknown = await real.json();
    await processing(
      route,
      typeof body === 'object' && body !== null ? Reflect.get(body, 'batchId') : '',
    );
  });
}

async function workbookZip(): Promise<Buffer> {
  return buildZip([
    { name: 'Shop/Pricing.xlsm', data: await pricingWorkbook() },
    { name: 'Shop/Discounts.xlsx', data: await discountsWorkbook() },
    { name: 'Shop/README.txt', data: 'The pricing workbooks of the shop.\n' },
  ]);
}

async function startUpload(page: Page): Promise<string> {
  const created = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/projects') && response.request().method() === 'POST',
  );
  await page
    .getByLabel('Zip file')
    .setInputFiles({ name: 'Shop.zip', mimeType: 'application/zip', buffer: await workbookZip() });
  await page.getByRole('button', { name: 'Upload zip' }).click();
  const body: unknown = await (await created).json();
  const id: unknown =
    typeof body === 'object' && body !== null ? Reflect.get(body, 'id') : undefined;
  if (typeof id !== 'string') throw new Error('the project has no id');
  return id;
}

/** The phase the real server gives the batch of the project. */
async function phaseOf(page: Page, url: string): Promise<unknown> {
  const body: unknown = await (await page.request.get(url)).json();
  return typeof body === 'object' && body !== null ? Reflect.get(body, 'phase') : undefined;
}

const kept = (page: Page) => page.getByRole('status').filter({ hasText: 'files kept' });

test.beforeEach(async ({ context, page }, info) => {
  await signInAs(context, accountFor('projects', info.project.name));
  await page.goto('/projects');
  await page.getByRole('tab', { name: 'Upload a zip' }).click();
});

test('RF-159 shows the steps, the workbook and sheet and the cells of a zip that holds workbooks, then the summary', async ({
  page,
}) => {
  const script: Script = { scripted: true };
  await scriptState(page, script);

  await startUpload(page);

  const panel = page.getByTestId('processing');
  await expect(panel).toBeVisible();
  await expect(panel.getByText('Rendering sheets')).toHaveAttribute('data-state', 'current');
  await expect(page.getByTestId('processing-detail')).toContainText(
    'Workbook 2 of 2, sheet 1 of 3. 1,200 cells read.',
  );
  await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
  await expectNoSeriousViolations(page);

  script.scripted = false;
  await expect(kept(page)).toBeVisible({ timeout: 15_000 });
  await expect(panel).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Start a run' })).toBeVisible();
});

test('DEC-188 closing the page does not cancel the work: the project page shows its progress after a reload and then the summary', async ({
  page,
}) => {
  const script: Script = { scripted: true };
  await scriptState(page, script);
  const projectId = await startUpload(page);
  await expect(page.getByTestId('processing')).toBeVisible();

  await page.goto(`/projects/${projectId}/start`);
  await expect(page.getByTestId('processing-detail')).toContainText('1,200 cells read');
  await page.reload();
  await expect(page.getByTestId('processing-detail')).toContainText('Workbook 2 of 2');
  const cancel = page.getByRole('button', { name: 'Cancel' });
  await cancel.focus();
  await expect(cancel).toBeFocused();
  await expectNoSeriousViolations(page);

  script.scripted = false;
  await expect(kept(page)).toBeVisible({ timeout: 15_000 });
});

test('DEC-188 a Cancel after the zip was stored answers 409, keeps the source and shows the summary', async ({
  page,
}) => {
  const script: Script = { scripted: true };
  await scriptState(page, script);
  const projectId = await startUpload(page);
  await expect(page.getByTestId('processing')).toBeVisible();
  const current = `/api/projects/${projectId}/source/batches/current`;
  await expect.poll(() => phaseOf(page, current), { timeout: 30_000 }).toBe('stored');
  const answered = page.waitForResponse(
    (response) => STATE_PATH.test(response.url()) && response.request().method() === 'DELETE',
  );

  await page.getByRole('button', { name: 'Cancel' }).click();
  const status = (await answered).status();
  script.scripted = false;

  expect(status).toBe(409);
  await expect(kept(page)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Nothing was published')).toHaveCount(0);
  const shown = await page.request.get(`/api/projects/${projectId}`);
  expect(await shown.json()).toMatchObject({ source: { workbooks: 2 } });
  await expectNoSeriousViolations(page);
});
