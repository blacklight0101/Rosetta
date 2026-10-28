import type { Page, Route } from '@playwright/test';
import { expect, test } from './support/fixtures.js';
import { expectNoSeriousViolations } from './support/axe.js';
import { accountFor } from './support/seed.js';
import { signInAs } from './support/sign-in.js';
import { journeyWorkbooks } from './support/workbook-journey.js';

// RF-159, RF-150, RNF-010, DEC-183: the Excel workbooks form while the server reads the batch. The
// project, the batch, the files and the finish are the real server's. A small batch is read in a few
// milliseconds, too fast to see, so the answers of the state endpoint are scripted for as long as a
// test says (what a large workbook would answer); once it lets go, the real state, with the real
// summary, comes through. The server's own timing and the polling are in the integration tests.

const STATE_PATH = /\/api\/projects\/[^/]+\/source\/batches\/[^/]+$/u;

interface Script {
  /** While true the state endpoint answers `states`; afterwards the real server answers. */
  scripted: boolean;
  step: 'rendering' | 'saving';
  reads: number;
}

const progress = (step: Script['step']) =>
  step === 'rendering'
    ? { step, workbook: 2, workbooks: 2, sheet: 1, sheets: 3, cells: 1200 }
    : { step, workbook: 2, workbooks: 2, sheet: 3, sheets: 3, cells: 2400 };

async function scriptState(page: Page, script: Script): Promise<void> {
  await page.route(STATE_PATH, async (route: Route) => {
    if (route.request().method() !== 'GET' || !script.scripted) {
      await route.continue();
      return;
    }
    script.reads += 1;
    const batchId = route.request().url().split('/').pop() ?? '';
    await route.fulfill({
      json: {
        ...{ batchId, phase: 'processing', files: 2, elapsedMs: 7000 + script.reads * 1000 },
        progress: progress(script.step),
      },
    });
  });
  await page.route(/\/api\/projects\/[^/]+\/source\/batches\/current$/u, async (route: Route) => {
    if (!script.scripted) {
      await route.continue();
      return;
    }
    const real = await route.fetch();
    const body: unknown = await real.json();
    const batchId: unknown =
      typeof body === 'object' && body !== null ? Reflect.get(body, 'batchId') : '';
    await route.fulfill({
      json: {
        ...{ batchId, phase: 'processing', files: 2, elapsedMs: 21_000 },
        progress: progress(script.step),
      },
    });
  });
}

async function startUpload(page: Page): Promise<string> {
  const files = await journeyWorkbooks();
  const created = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/projects') && response.request().method() === 'POST',
  );
  await page.getByLabel('Workbook files').setInputFiles([...files]);
  await page.getByRole('button', { name: 'Upload workbooks' }).click();
  const body: unknown = await (await created).json();
  const id: unknown =
    typeof body === 'object' && body !== null ? Reflect.get(body, 'id') : undefined;
  if (typeof id !== 'string') throw new Error('the project has no id');
  return id;
}

test.beforeEach(async ({ context, page }, info) => {
  await signInAs(context, accountFor('projects', info.project.name));
  await page.goto('/projects');
  await page.getByRole('tab', { name: 'Excel workbooks' }).click();
});

test('RF-159 shows the steps, the workbook and sheet, the cells and the time, then the summary', async ({
  page,
}) => {
  const script: Script = { scripted: true, step: 'rendering', reads: 0 };
  await scriptState(page, script);

  await startUpload(page);

  const panel = page.getByTestId('processing');
  await expect(panel).toBeVisible();
  await expect(panel.getByText('Rendering sheets')).toHaveAttribute('data-state', 'current');
  await expect(panel.getByText('Reading workbooks')).toHaveAttribute('data-state', 'done');
  await expect(page.getByTestId('processing-detail')).toContainText(
    'Workbook 2 of 2, sheet 1 of 3. 1,200 cells read.',
  );
  await expect(page.getByTestId('processing-detail')).toContainText('elapsed');
  await expect(page.getByRole('button', { name: 'Cancel' })).toBeVisible();
  const said = page.getByRole('status').filter({ hasText: 'Rendering the sheets.' });
  await expect(said).toHaveAttribute('aria-live', 'polite');
  await expectNoSeriousViolations(page);

  script.step = 'saving';
  await expect(panel.getByText('Saving', { exact: true })).toHaveAttribute(
    'data-state',
    'current',
    {
      timeout: 10_000,
    },
  );
  await expect(said).toHaveCount(0);

  script.scripted = false;
  await expect(page.getByRole('status').filter({ hasText: '2 workbooks read' })).toBeVisible({
    timeout: 15_000,
  });
  await expect(panel).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Start a run' })).toBeVisible();
});

test('RF-159 closing the page does not cancel the work: the project page shows its progress after a reload and then the summary', async ({
  page,
}) => {
  const script: Script = { scripted: true, step: 'rendering', reads: 0 };
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
  await expect(page.getByRole('status').filter({ hasText: '2 workbooks read' })).toBeVisible({
    timeout: 15_000,
  });
  await expect(
    page.getByText(/Pricing\.xlsm.*Discounts\.xlsx|Excel, 2 workbooks/u).first(),
  ).toBeVisible();
});

test('RF-159 Cancel stops the batch, publishes nothing and offers Upload again by keyboard', async ({
  page,
}) => {
  const script: Script = { scripted: true, step: 'rendering', reads: 0 };
  await scriptState(page, script);
  await startUpload(page);
  const cancel = page.getByRole('button', { name: 'Cancel' });
  await expect(cancel).toBeVisible();

  await cancel.focus();
  await page.keyboard.press('Enter');

  await expect(page.getByRole('alert')).toContainText('Nothing was published');
  await expect(page.getByRole('button', { name: 'Upload again' })).toBeVisible();
  await expect(page.getByTestId('processing')).toHaveCount(0);
  await expectNoSeriousViolations(page);
});
