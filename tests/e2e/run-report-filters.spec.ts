import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Browser, Page } from '@playwright/test';
import { SecretMasker } from '../../src/infrastructure/guards/secret-masker.js';
import { buildSiteFiles } from '../../src/infrastructure/report/published-site.js';
import { filterCards } from '../support/report-filter-fixtures.js';
import { reportModel } from '../support/report-fixtures.js';
import { expectNoSeriousViolations } from './support/axe.js';
import { expect, test } from './support/fixtures.js';

// RF-503, RF-506, RF-507, RNF-010: the filters of the dashboard, in a browser, with no server. The
// report is written the way the published site is (buildSiteFiles) into a folder of the disk and
// opened from there with file://, so nothing but the files of the folder is available. The browser
// of this spec refuses every request that is not a file of that folder.

const templates = fileURLToPath(new URL('../../templates/report/', import.meta.url));
let folder = '';

test.beforeAll(async () => {
  folder = await mkdtemp(join(tmpdir(), 'rosetta-report-filters-'));
  const assets = {
    'report.css': await readFile(join(templates, 'report.css'), 'utf8'),
    'replay.js': await readFile(join(templates, 'replay.js'), 'utf8'),
    'filters.js': await readFile(join(templates, 'filters.js'), 'utf8'),
  };
  const model = reportModel({ cards: [...filterCards] });
  const files = buildSiteFiles(model, assets, new SecretMasker(), {});
  for (const [name, text] of Object.entries(files)) {
    await mkdir(dirname(join(folder, name)), { recursive: true });
    await writeFile(join(folder, name), text);
  }
});

test.afterAll(async () => {
  await rm(folder, { recursive: true, force: true });
});

const address = (name: string, hash = ''): string =>
  `${pathToFileURL(join(folder, name)).href}${hash}`;

interface Opened {
  readonly page: Page;
  readonly requests: string[];
  readonly dialogs: string[];
}

/** A page of its own that sees only file:// and records what it asks for and what pops up. */
async function openFromDisk(
  browser: Browser,
  options: { readonly javaScript: boolean },
  url: string,
): Promise<Opened> {
  const context = await browser.newContext({ javaScriptEnabled: options.javaScript });
  const page = await context.newPage();
  const requests: string[] = [];
  const dialogs: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  page.on('dialog', (dialog) => {
    dialogs.push(dialog.message());
    void dialog.dismiss();
  });
  await page.goto(url);
  return { page, requests, dialogs };
}

const visibleRows = (page: Page) => page.locator('table.cards tbody tr:visible td:first-child');

test.describe('the filters, opened from disk with no server', () => {
  test('RF-503 shows only the cards of the chosen type, area and status, and says how many', async ({
    browser,
  }) => {
    const { page, requests } = await openFromDisk(
      browser,
      { javaScript: true },
      address('report.html'),
    );
    await expect(visibleRows(page)).toHaveText(['FEAT-001', 'BR-001', 'ENT-001', 'BR-002']);

    await page.getByRole('combobox', { name: 'Type', exact: true }).selectOption('BR');
    await expect(visibleRows(page)).toHaveText(['BR-001', 'BR-002']);
    await expect(page.getByRole('status').filter({ hasText: 'Showing' })).toHaveText(
      'Showing 2 of 4 cards',
    );

    await page.getByRole('combobox', { name: 'Area', exact: true }).selectOption('orders');
    await expect(visibleRows(page)).toHaveText(['BR-001']);
    await page.getByRole('combobox', { name: 'Status', exact: true }).selectOption('Rejected');
    await expect(visibleRows(page)).toHaveText(['BR-001']);
    await page
      .getByRole('combobox', { name: 'Status', exact: true })
      .selectOption('CitationInvalid');
    await expect(visibleRows(page)).toHaveCount(0);

    // Every request was a file of the folder: no server, no network.
    expect(requests.every((url) => url.startsWith('file://'))).toBe(true);
    await page.context().close();
  });
});

test.describe('the filters and the empty state, from disk', () => {
  test('RF-503 shows an empty state when nothing matches and gives the cards back on Reset', async ({
    browser,
  }) => {
    const { page } = await openFromDisk(browser, { javaScript: true }, address('report.html'));

    await page.getByRole('combobox', { name: 'Type', exact: true }).selectOption('ENT');
    await page.getByRole('combobox', { name: 'Area', exact: true }).selectOption('orders');

    await expect(page.getByText('No cards match these filters')).toBeVisible();
    await expect(page.locator('table.cards')).toBeHidden();
    await expectNoSeriousViolations(page);

    await page.getByRole('button', { name: 'Reset filters' }).click();
    await expect(page.getByText('No cards match these filters')).toBeHidden();
    await expect(visibleRows(page)).toHaveCount(4);
    await page.context().close();
  });

  test('RF-503 starts from the filters the address names, so a filtered view can be shared', async ({
    browser,
  }) => {
    const { page } = await openFromDisk(
      browser,
      { javaScript: true },
      address('report.html', '#type=BR&area=catalog'),
    );

    await expect(visibleRows(page)).toHaveText(['BR-002']);
    await expect(page.getByRole('combobox', { name: 'Type', exact: true })).toHaveValue('BR');
    await page.context().close();
  });
});

test.describe('the filters and a hostile address, from disk', () => {
  test('RF-507 ignores filter state in the address that is a script, too long or unknown', async ({
    browser,
  }) => {
    const hostile = [
      '#type=<script>window.__pwned=1</script>',
      '#area=%22%3E%3Cimg%20src%3Dx%20onerror%3Dwindow.__pwned%3D1%3E',
      '#type=NOPE&status=javascript:window.__pwned=1',
      `#area=${'a'.repeat(100_000)}`,
    ];
    for (const hash of hostile) {
      const { page, dialogs } = await openFromDisk(
        browser,
        { javaScript: true },
        address('report.html', hash),
      );

      await expect(visibleRows(page)).toHaveCount(4);
      await expect(page.locator('script')).toHaveCount(1);
      await expect(page.locator('main img, [onerror]')).toHaveCount(0);
      expect(await page.evaluate<unknown>('globalThis.__pwned')).toBeUndefined();
      expect(dialogs).toEqual([]);
      await page.context().close();
    }
  });

  test('RNF-010 reaches the filters in order with the keyboard and announces the result', async ({
    browser,
  }) => {
    const { page } = await openFromDisk(browser, { javaScript: true }, address('report.html'));
    await expectNoSeriousViolations(page);

    await page.getByRole('combobox', { name: 'Type', exact: true }).focus();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('combobox', { name: 'Area', exact: true })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('combobox', { name: 'Status', exact: true })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Reset filters' })).toBeFocused();

    await page.getByRole('combobox', { name: 'Status', exact: true }).focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('status').filter({ hasText: 'Showing' })).toContainText(
      'of 4 cards',
    );
    await page.context().close();
  });
});

test.describe('the filters without scripts and the replay link, from disk', () => {
  test('RF-503 shows every card and no dead controls when JavaScript is off', async ({
    browser,
  }) => {
    const { page } = await openFromDisk(browser, { javaScript: false }, address('report.html'));

    await expect(visibleRows(page)).toHaveCount(4);
    await expect(page.locator('[data-card-filters]')).toBeHidden();
    await page.context().close();
  });

  test('RF-506 links the run replay from the dashboard and opens it from disk', async ({
    browser,
  }) => {
    const { page } = await openFromDisk(browser, { javaScript: true }, address('report.html'));

    await page.getByRole('main').getByRole('link', { name: 'Run replay' }).click();

    await expect(page.getByRole('heading', { name: 'Run replay', level: 1 })).toBeVisible();
    await page.context().close();
  });
});
