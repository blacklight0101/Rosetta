import type { Page, Route } from '@playwright/test';
import { expect, test } from './support/fixtures.js';
import { expectNoSeriousViolations } from './support/axe.js';
import { accountFor } from './support/seed.js';
import { signInAs } from './support/sign-in.js';

// RF-128, RF-134, RNF-010, RFC-004 section 4.5: the Upload a zip tab of the New project form. The
// upload endpoint (P3-38) is not built yet, so the project routes answer from this file (the fake
// server of the card); the page, its size check and its layout are real. The limit is lowered to
// 1 MB through the session answer, so a file above it is small enough to build in a test.

const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]);
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
  id: 'p-zip',
  name: 'OrderDesk',
  sourceUrl: '',
  ref: '',
  subpath: '',
  settings,
  settingsVersion: 1,
  createdAt: '2026-10-19T08:00:00.000Z',
  updatedAt: '2026-10-19T08:00:00.000Z',
  sourceKind: 'upload',
  source: { fileName: 'OrderDesk.zip', uploadedAt: '2026-10-19T08:00:00.000Z' },
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

test.beforeEach(async ({ context, page }, info) => {
  await limitTo(page, 1);
  await signInAs(context, accountFor('projects', info.project.name));
  await page.goto('/projects');
  await page.getByRole('tab', { name: 'Upload a zip' }).click();
});

test('RF-134 states the limit and the steps, and refuses a file above it before sending', async ({
  page,
}) => {
  const sent: string[] = [];
  page.on('request', (request) => {
    if (request.method() !== 'GET') sent.push(`${request.method()} ${request.url()}`);
  });
  await expect(page.getByText('Largest zip: 1 MB')).toBeVisible();
  await expect(page.getByText(/Windows:/u)).toBeVisible();

  await page.getByLabel('Zip file').setInputFiles({
    name: 'big.zip',
    mimeType: 'application/zip',
    buffer: Buffer.concat([zip, Buffer.alloc(2 * 1024 * 1024)]),
  });

  await expect(page.getByTestId('field-error')).toContainText('the limit is 1 MB');
  await expect(page.getByRole('button', { name: 'Upload zip' })).toBeDisabled();
  expect(sent).toEqual([]);
  await expectNoSeriousViolations(page);
});

test(
  'RF-128 uploads a zip, shows what was kept and lists the project as a zip',
  { tag: '@phone' },
  async ({ page }) => {
    await page.route('**/api/projects', async (route: Route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({ status: 201, json: { ...project, source: null } });
      } else await route.continue();
    });
    await page.route('**/api/projects/p-zip/source', async (route: Route) => {
      await route.fulfill({
        status: 201,
        json: { files: 70, size: 3_200_000, skipped: 12, snapshotHash: 'a'.repeat(64) },
      });
    });
    await page.getByLabel('Zip file').setInputFiles({
      name: 'OrderDesk.zip',
      mimeType: 'application/zip',
      buffer: zip,
    });
    await expect(page.getByLabel('Project name')).toHaveValue('OrderDesk');

    await page.getByRole('button', { name: 'Upload zip' }).click();

    await expect(page.getByRole('status').filter({ hasText: '70 files kept' })).toContainText(
      '12 entries left out',
    );
    await expect(page.getByRole('link', { name: 'Start a run' })).toBeVisible();
    await expectNoSeriousViolations(page);
    const overflow: unknown = await page.evaluate(
      'document.documentElement.scrollWidth - window.innerWidth',
    );
    expect(Number(overflow)).toBeLessThanOrEqual(0);
  },
);

test('RF-128 a refused upload shows its message and offers Upload again', async ({ page }) => {
  await page.route('**/api/projects', async (route: Route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({ status: 201, json: { ...project, source: null } });
    } else await route.continue();
  });
  await page.route('**/api/projects/p-zip/source', async (route: Route) => {
    await route.fulfill({
      status: 422,
      json: {
        code: 'RST-1902',
        message: 'The archive holds no code after the ignored folders were left out.',
        nextStep: 'Remove the node_modules folder and zip again.',
      },
    });
  });
  await page.getByLabel('Zip file').setInputFiles({
    name: 'OrderDesk.zip',
    mimeType: 'application/zip',
    buffer: zip,
  });

  await page.getByRole('button', { name: 'Upload zip' }).click();

  await expect(page.getByRole('alert').filter({ hasText: 'RST-1902' })).toContainText(
    'Remove the node_modules folder and zip again.',
  );
  await expect(page.getByText('has no source yet')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Upload again' })).toBeVisible();
  await expectNoSeriousViolations(page);
});
