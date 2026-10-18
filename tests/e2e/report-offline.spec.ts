import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import type { Page } from '@playwright/test';
// eslint-disable-next-line no-restricted-imports -- this spec opens report files from disk (file://), which the network guard of fixtures.ts refuses; it watches every request of its pages itself.
import { expect, test } from '@playwright/test';
import { filesOf, readZip } from '../support/zip-reader.js';
import { expectNoSeriousViolations } from './support/axe.js';
import {
  runKey,
  serveReportFolder,
  writeDownloadableReport,
  type DownloadableReport,
} from './support/downloadable-report.js';
import { expectKeyboardWalk } from './support/keyboard-walk.js';

// RF-501, RF-505, RNF-010, DEC-24, P3-04: the report of a run as the real report writer and zip
// writer leave it. It is opened from a folder on disk and served under a sub-path with the headers
// of the application: every page opens with no request beyond the report's own files, "Download
// all" gives the zip of the run (and the hand-off zip only when the run has a package) and both
// unzip, every page passes axe in the light and dark themes, and the keyboard reaches every control.

const prefix = '/pages/rosetta/';
const pages = ['report.html', 'questions.html', 'replay.html', 'cost.html'] as const;

/** Every request of the page, from now on. */
function watchRequests(page: Page): string[] {
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  return requests;
}

const hrefs = (page: Page): Promise<string[]> =>
  page
    .locator('a[href]')
    .evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''));

/** The pages of the report folder the page links, once each. */
async function linkedPages(page: Page): Promise<string[]> {
  const own = (await hrefs(page)).filter((href) => /^[\w.-]+\.html$/u.test(href));
  return [...new Set(own)].sort();
}

/** Opens the dashboard, then every page it links, then the pages those link; returns the pages seen. */
async function visitEveryPage(page: Page, open: (name: string) => string): Promise<string[]> {
  const seen = new Set<string>();
  const queue = ['report.html'];
  for (let name = queue.shift(); name !== undefined; name = queue.shift()) {
    if (seen.has(name)) continue;
    seen.add(name);
    await page.goto(open(name));
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    queue.push(...(await linkedPages(page)));
  }
  return [...seen].sort();
}

/** The files of the zip a click on the link downloads, by entry name. */
async function downloadedZip(page: Page, link: string): Promise<Readonly<Record<string, string>>> {
  const waiting = page.waitForEvent('download');
  await page.getByRole('link', { name: link }).click();
  const download = await waiting;
  const path = await download.path();
  return filesOf(await readZip(await readFile(path)));
}

const runZipFiles = [
  `${runKey}/cards/BR/BR-001.md`,
  `${runKey}/manifest.json`,
  `${runKey}/report/report.html`,
  `${runKey}/spec.md`,
];
const handoffZipFiles = [`${runKey}/handoff/README.md`, `${runKey}/handoff/tasks/T-001.md`];

/** The run zip holds the run folder, the report included, and none of the report's own zips. */
function expectRunZip(run: Readonly<Record<string, string>>, handoff: boolean): void {
  const names = Object.keys(run);
  expect(names).toEqual(expect.arrayContaining(runZipFiles));
  expect(names.some((name) => name.endsWith('.zip'))).toBe(false);
  expect(names.filter((name) => name.includes('/handoff/')).sort()).toEqual(
    handoff ? handoffZipFiles : [],
  );
}

test.describe('the report with a hand-off package, from disk', () => {
  let report: DownloadableReport;
  const address = (name: string): string => pathToFileURL(`${report.folder}/${name}`).href;

  test.beforeAll(async () => {
    report = await writeDownloadableReport({ handoff: true });
  });

  test.afterAll(async () => {
    await report.remove();
  });

  test('RF-501 opens every page from a folder on disk, asking for no file but the report own', async ({
    page,
  }) => {
    const requests = watchRequests(page);

    const seen = await visitEveryPage(page, address);

    expect(seen).toEqual(expect.arrayContaining([...pages]));
    expect(seen.length).toBeGreaterThan(pages.length);
    const folder = pathToFileURL(`${report.folder}/`).href;
    expect(requests.filter((url) => !url.startsWith(folder))).toEqual([]);
  });

  test('RF-505 downloads the zip of the run and the zip of the hand-off package, and both unzip', async ({
    page,
  }) => {
    await page.goto(address('report.html'));

    const run = await downloadedZip(page, 'Download all: the run as a zip');
    const handoff = await downloadedZip(page, 'Download the hand-off package as a zip');

    expectRunZip(run, true);
    expect(run[`${runKey}/spec.md`]).toBe('# Specification\n');
    expect(handoff).toEqual({
      'handoff/README.md': '# Hand-off package\n',
      'handoff/tasks/T-001.md': '# First task\n',
    });
  });
});

test.describe('the pages of the report, for accessibility', () => {
  let report: DownloadableReport;
  const address = (name: string): string => pathToFileURL(`${report.folder}/${name}`).href;

  test.beforeAll(async () => {
    report = await writeDownloadableReport({ handoff: true });
  });

  test.afterAll(async () => {
    await report.remove();
  });

  test('RNF-010 passes axe on every page, in the light and the dark theme', async ({ page }) => {
    test.slow();
    const seen = await visitEveryPage(page, address);
    for (const name of seen) {
      await page.goto(address(name));
      await expectNoSeriousViolations(page);
    }
  });

  test('RNF-010 reaches every control of every page with the keyboard, each showing focus', async ({
    page,
  }) => {
    test.slow();
    const seen = await visitEveryPage(page, address);
    for (const name of seen) {
      await page.goto(address(name));
      await expectKeyboardWalk(page);
    }
  });
});

test.describe('the report with no hand-off package, from disk', () => {
  let report: DownloadableReport;

  test.beforeAll(async () => {
    report = await writeDownloadableReport({ handoff: false });
  });

  test.afterAll(async () => {
    await report.remove();
  });

  test('RF-505 offers the zip of the run alone, and it holds no hand-off folder', async ({
    page,
  }) => {
    await page.goto(pathToFileURL(`${report.folder}/report.html`).href);

    await expect(page.getByRole('link', { name: /zip$/u })).toHaveCount(1);
    await expect(page.getByRole('link', { name: /hand-off package/u })).toHaveCount(0);
    const run = await downloadedZip(page, 'Download all: the run as a zip');
    expectRunZip(run, false);
  });
});

test.describe('the report under a sub-path', () => {
  let report: DownloadableReport;

  test.beforeAll(async () => {
    report = await writeDownloadableReport({ handoff: true });
  });

  test.afterAll(async () => {
    await report.remove();
  });

  test('RF-501 RF-505 opens every page and downloads both zips under a sub-path, asking for nothing outside it', async ({
    page,
  }) => {
    const site = await serveReportFolder(report.folder, prefix);
    try {
      const requests = watchRequests(page);
      const base = `${site.origin}${prefix}`;

      const seen = await visitEveryPage(page, (name) => `${base}${name}`);
      await page.goto(`${base}report.html`);
      const run = await downloadedZip(page, 'Download all: the run as a zip');
      const handoff = await downloadedZip(page, 'Download the hand-off package as a zip');

      expect(seen.length).toBeGreaterThan(pages.length);
      expectRunZip(run, true);
      expect(Object.keys(handoff).sort()).toEqual(['handoff/README.md', 'handoff/tasks/T-001.md']);
      expect(requests.filter((url) => !url.startsWith(base))).toEqual([]);
      await expectNoSeriousViolations(page);
    } finally {
      await site.close();
    }
  });
});
