import type { Page, Route } from '@playwright/test';
import { expect, test } from './support/fixtures.js';
import { expectNoSeriousViolations } from './support/axe.js';
import { accountFor } from './support/seed.js';
import { signInAs } from './support/sign-in.js';

// RF-150, RF-158, RNF-010, RFC-005 section 4.9: the Excel workbooks tab of the New project form. The
// project and batch routes answer from this file (the fake server of the card, with the state of the
// batch after the finish, RF-159); the page, its checks and its layout are real. The limit is lowered
// to 1 MB through the session answer, so a set above it is small enough to build in a test.

const workbook = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);
const role = { provider: 'ollama', model: 'gemma4:e4b', maxOutputTokens: 2048 };
const settings = {
  providers: {
    ollama: {
      kind: 'ollama',
      keySource: 'user-then-server',
      toolMode: 'native',
      timeoutSeconds: 120,
      maxRetries: 3,
    },
  },
  roles: { reader: role, verifier: role, planner: role, summariser: role },
  budget: {
    run: { maxCostMicros: 500_000, maxTokens: 2_000_000 },
    confirmAboveCostMicros: 250_000,
    allowUnpriced: false,
  },
  scan: { maxFileBytes: 1_000_000, areaTokenBudget: 60_000, excerptMaxLines: 400, ignoreRules: '' },
  agents: { parallelism: 1 },
};
const project = {
  id: 'p-book',
  name: 'Pricing',
  sourceUrl: '',
  ref: '',
  subpath: '',
  settings,
  settingsVersion: 1,
  createdAt: '2026-10-19T08:00:00.000Z',
  updatedAt: '2026-10-19T08:00:00.000Z',
  sourceKind: 'workbook',
  source: null,
};
const finished = {
  workbooks: [
    { name: 'Pricing.xlsx', sheets: 4, cells: 1200, formulas: 310, macroModules: 0 },
    { name: 'Costs.xlsm', sheets: 2, cells: 90, formulas: 12, macroModules: 3 },
  ],
  skipped: [{ name: 'Costs.xlsm', reason: 'Macro module Module9 is locked and was not read.' }],
  snapshotHash: 'b'.repeat(64),
  uploadedAt: '2026-10-19T08:00:00.000Z',
};

async function limitTo(page: Page, megabytes: number): Promise<void> {
  await page.route('**/api/session', async (route: Route) => {
    const real = await route.fetch();
    const body: unknown = await real.json();
    await route.fulfill({
      response: real,
      json: { ...(typeof body === 'object' ? body : {}), uploadMaxMb: megabytes },
    });
  });
}

/** RF-159: the server accepts the finish at once; the state it then answers is the outcome. */
async function answerBatchCalls(page: Page, state: { status: number; json: unknown }) {
  await page.route('**/api/projects', async (route: Route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({ status: 201, json: project });
    } else await route.continue();
  });
  await page.route('**/api/projects/p-book/source/batches', async (route: Route) => {
    await route.fulfill({ status: 201, json: { batchId: 'b-1' } });
  });
  await page.route('**/api/projects/p-book/source/batches/b-1/files', async (route: Route) => {
    await route.fulfill({ status: 201, json: { name: 'x', size: 8 } });
  });
  await page.route('**/api/projects/p-book/source/batches/b-1/finish', async (route: Route) => {
    await route.fulfill({
      status: 202,
      json: { batchId: 'b-1', phase: 'processing', files: 2, elapsedMs: 0 },
    });
  });
  await page.route('**/api/projects/p-book/source/batches/b-1', async (route: Route) => {
    await route.fulfill(state);
  });
}

const two = [
  { name: 'Pricing.xlsx', mimeType: 'application/octet-stream', buffer: workbook },
  { name: 'Costs.xlsm', mimeType: 'application/octet-stream', buffer: workbook },
];

test.beforeEach(async ({ context, page }, info) => {
  await limitTo(page, 1);
  await signInAs(context, accountFor('projects', info.project.name));
  await page.goto('/projects');
  await page.getByRole('tab', { name: 'Excel workbooks' }).click();
});

test('RF-158 states the types and limits and refuses an .xls, 21 files and a set above the size limit before sending', async ({
  page,
}) => {
  const sent: string[] = [];
  page.on('request', (request) => {
    if (request.method() !== 'GET') sent.push(`${request.method()} ${request.url()}`);
  });
  await expect(
    page.getByText('Accepted: .xlsx and .xlsm. At most 20 files and 1 MB in all.'),
  ).toBeVisible();
  const field = page.getByLabel('Workbook files');

  await field.setInputFiles({
    name: 'Old.xls',
    mimeType: 'application/vnd.ms-excel',
    buffer: workbook,
  });
  await expect(page.getByTestId('field-error')).toContainText('save it as .xlsx');

  await field.setInputFiles({ name: 'README.md', mimeType: 'text/markdown', buffer: workbook });
  await expect(page.getByRole('list', { name: 'Chosen workbooks' })).toContainText(
    'Not a workbook',
  );
  await expect(page.getByRole('list', { name: 'Chosen workbooks' })).not.toContainText('Waiting');

  await field.setInputFiles(
    Array.from({ length: 21 }, (_, index) => ({
      name: `Book ${String(index + 1)}.xlsx`,
      mimeType: 'application/octet-stream',
      buffer: workbook,
    })),
  );
  await expect(page.getByTestId('field-error')).toContainText('at most 20 workbooks');

  await field.setInputFiles({
    name: 'Big.xlsx',
    mimeType: 'application/octet-stream',
    buffer: Buffer.concat([workbook, Buffer.alloc(2 * 1024 * 1024)]),
  });
  await expect(page.getByTestId('field-error')).toContainText('the limit is 1 MB');
  await expect(page.getByRole('button', { name: 'Upload workbooks' })).toBeDisabled();
  expect(sent).toEqual([]);
  await expectNoSeriousViolations(page);
});

test(
  'RF-150 uploads two workbooks one by one, shows what was read and lists the project as Excel',
  { tag: '@phone' },
  async ({ page }) => {
    await answerBatchCalls(page, {
      status: 200,
      json: { batchId: 'b-1', phase: 'stored', files: 2, elapsedMs: 3100, summary: finished },
    });
    await page.getByLabel('Workbook files').setInputFiles(two);
    await expect(page.getByLabel('Project name')).toHaveValue('Pricing');

    await page.getByRole('button', { name: 'Upload workbooks' }).click();

    await expect(page.getByRole('status').filter({ hasText: '2 workbooks read' })).toBeVisible();
    await expect(page.getByText('Pricing.xlsx: 4 sheets, 1,200 cells, 310 formulas')).toBeVisible();
    await expect(page.getByText('1 item left out')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Start a run' })).toBeVisible();
    await expectNoSeriousViolations(page);
    const overflow: unknown = await page.evaluate(
      'document.documentElement.scrollWidth - window.innerWidth',
    );
    expect(Number(overflow)).toBeLessThanOrEqual(0);
  },
);

test('RF-150 a refused batch shows its message and offers Upload again', async ({ page }) => {
  await answerBatchCalls(page, {
    status: 200,
    json: {
      ...{ batchId: 'b-1', phase: 'refused', files: 2, elapsedMs: 900 },
      refusal: {
        ...{ status: 422, code: 'RST-1922' },
        message: 'Costs.xlsm is password-protected.',
        nextStep: 'Remove the password in Excel and upload again.',
      },
    },
  });
  await page.getByLabel('Workbook files').setInputFiles(two);

  await page.getByRole('button', { name: 'Upload workbooks' }).click();

  await expect(page.getByRole('alert').filter({ hasText: 'RST-1922' })).toContainText(
    'Remove the password in Excel and upload again.',
  );
  await expect(page.getByText('has no source yet')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Upload again' })).toBeVisible();
  await expectNoSeriousViolations(page);
});
