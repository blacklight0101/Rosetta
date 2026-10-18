import { pathToFileURL } from 'node:url';
import type { Page } from '@playwright/test';
// eslint-disable-next-line no-restricted-imports -- this spec opens report files from disk (file://), which the network guard of fixtures.ts refuses; it watches every request of its pages itself.
import { expect, test } from '@playwright/test';
import { expectNoSeriousViolations } from './support/axe.js';
import {
  brokenTitle,
  diagramCount,
  generatedTitles,
  rawTitle,
  serveSite,
  writeReportFolder,
} from './support/diagram-report.js';
import { expectNothingInjected, watchDialogs } from './support/hostile-card.js';

// RF-508, RF-507, RF-501, RNF-010, P3-14: the diagrams page of a report whose names, labels and steps
// are hostile (Mermaid syntax, HTML, a `javascript:` link). The report is written by the real report
// writer and opened from a folder on disk, and the published site is served under a sub-path with
// the headers of the application. Every diagram is drawn by the vendored Mermaid build, nothing runs,
// the browser asks for no file but the report's own, and the diagram that cannot be parsed shows its
// source with a note while the rest of the page works.

const figure = (page: Page, title: string) =>
  page.locator('figure[data-diagram]').filter({ has: page.getByRole('heading', { name: title }) });

/** Every request of the page, and the dialogs it opens. */
function watch(page: Page): { requests: string[]; dialogs: string[] } {
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  return { requests, dialogs: watchDialogs(page) };
}

async function drawn(page: Page): Promise<void> {
  await expect(figure(page, 'Entities').locator('svg')).toBeVisible();
  await expect(page.locator('figure[data-diagram]')).toHaveCount(diagramCount);
}

async function expectDiagramsDrawn(page: Page, dialogs: readonly string[]): Promise<void> {
  await drawn(page);
  // Every diagram but the one that cannot be parsed is a drawing whose source is folded away.
  await expect(page.locator('figure[data-diagram] [data-diagram-drawing] svg')).toHaveCount(
    diagramCount - 1,
  );
  for (const title of [...generatedTitles, rawTitle]) {
    await expect(figure(page, title).locator('[data-diagram-note]')).toBeHidden();
    await expect(figure(page, title).locator('details')).not.toHaveAttribute('open', '');
  }
  const broken = figure(page, brokenTitle);
  await expect(broken.locator('[data-diagram-note]')).toBeVisible();
  await expect(broken.locator('details')).toHaveAttribute('open', '');
  await expect(broken.locator('pre')).toContainText('a --- (((');
  await expect(broken.locator('svg')).toHaveCount(0);
  await expectLabelsAsText(page);
  await expectNothingDrawnCouldRun(page, dialogs);
}

/** A label is the text of the code it came from, entity codes decoded: the payload is words, not markup. */
async function expectLabelsAsText(page: Page): Promise<void> {
  const entities = figure(page, 'Entities');
  await expect(entities).toContainText("<script>window.__pwned='script'</script>");
  await expect(entities).not.toContainText('&#');
}

async function expectNothingDrawnCouldRun(page: Page, dialogs: readonly string[]): Promise<void> {
  await expectNothingInjected(page, dialogs);
  // Mermaid wraps a node that has a click statement in an `a` it leaves without an address.
  const risky = 'svg img, svg script, svg style, foreignObject img, foreignObject script';
  await expect(page.locator(risky)).toHaveCount(0);
  await expect(page.locator('svg [href], svg [src], svg [xlink\\:href]')).toHaveCount(0);
}

/** The drawing is styled: its rules reached the page through the CSSOM, the policy refuses inline ones. */
async function expectStyled(page: Page): Promise<void> {
  const fill = await figure(page, 'Screens')
    .locator('svg rect')
    .first()
    .evaluate((rect) => getComputedStyle(rect).fill);
  expect(fill).not.toBe('rgb(0, 0, 0)');
  expect(fill).not.toBe('none');
  expect(await page.evaluate<number>('document.adoptedStyleSheets.length')).toBeGreaterThan(0);
}

test.describe('the diagrams of a report on disk', () => {
  test('RF-508 draws every diagram from a folder on disk, asking for no file but the report own', async ({
    page,
  }) => {
    const report = await writeReportFolder();
    try {
      const seen = watch(page);
      const address = pathToFileURL(`${report.folder}/diagrams.html`).href;

      await page.goto(address);

      await expectDiagramsDrawn(page, seen.dialogs);
      await expectStyled(page);
      const folder = pathToFileURL(`${report.folder}/`).href;
      expect(seen.requests.filter((url) => !url.startsWith(folder))).toEqual([]);
      expect(seen.requests.map((url) => url.slice(folder.length)).sort()).toEqual([
        'diagrams.html',
        'diagrams.js',
        'mermaid.min.js',
        'report.css',
      ]);
    } finally {
      await report.remove();
    }
  });
});

test.describe('the diagrams of the published report', () => {
  const prefix = '/pages/rosetta/';

  test('RF-508 RF-501 draws every diagram under a sub-path with the headers of the application', async ({
    page,
  }) => {
    const site = await serveSite(prefix);
    try {
      const seen = watch(page);

      await page.goto(`${site.origin}${prefix}diagrams.html`);

      await expectDiagramsDrawn(page, seen.dialogs);
      await expectStyled(page);
      expect(seen.requests.filter((url) => !url.startsWith(`${site.origin}${prefix}`))).toEqual([]);
      await expectNoSeriousViolations(page);
    } finally {
      await site.close();
    }
  });
});

test.describe('the diagrams of the published report when they cannot be drawn', () => {
  const prefix = '/pages/rosetta/';

  test('RF-508 shows every source with a note, and the rest of the report works, when the Mermaid build does not load', async ({
    page,
  }) => {
    const site = await serveSite(prefix);
    try {
      await page.route('**/mermaid.min.js', (route) => route.abort());

      await page.goto(`${site.origin}${prefix}diagrams.html`);

      await expect(page.locator('[data-diagram-note]:visible')).toHaveCount(diagramCount);
      await expect(page.locator('figure[data-diagram] pre:visible')).toHaveCount(diagramCount);
      await page.getByRole('link', { name: 'Dashboard' }).first().click();
      await expect(page.getByRole('heading', { name: 'Run report', level: 1 })).toBeVisible();
    } finally {
      await site.close();
    }
  });

  test('RF-508 shows the source of every diagram, as text, when scripts are off', async ({
    browser,
  }) => {
    const site = await serveSite(prefix);
    const context = await browser.newContext({ javaScriptEnabled: false });
    try {
      const page = await context.newPage();

      await page.goto(`${site.origin}${prefix}diagrams.html`);

      await expect(page.locator('figure[data-diagram] pre:visible')).toHaveCount(diagramCount);
      await expect(page.locator('[data-diagram-note]:visible')).toHaveCount(0);
      await expect(page.locator('figure svg')).toHaveCount(0);
    } finally {
      await context.close();
      await site.close();
    }
  });
});
