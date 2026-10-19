import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { buildZip, type ZipItem } from '../../support/zip-fixtures.js';
import { expect } from './fixtures.js';
import { chooseAreas, runScan } from './journey-pages.js';
import { runStatus, startAndOpenLiveRun } from './live-run-page.js';

// RF-128, RF-130, RF-131, P3-42: the steps of the journey of a project analysed from a zip. The zip
// is made in the test from the first-party C# fixture (tests/fixtures/repos/webforms-csharp) under
// one top-level folder, as a Compressed folder makes it; nothing binary is committed. Its recorded
// understand run is the one the test server replays (e2e-provider.ts).

const FIXTURE = join('tests', 'fixtures', 'repos', 'webforms-csharp');
const ZIP_TOP_FOLDER = 'ShopWeb';

async function itemsBelow(folder: string, prefix: string): Promise<readonly ZipItem[]> {
  const entries = await readdir(join(FIXTURE, folder), { withFileTypes: true });
  const items: ZipItem[] = [];
  for (const entry of [...entries].sort((a, b) => a.name.localeCompare(b.name))) {
    const inZip = `${prefix}/${entry.name}`;
    const onDisk = join(folder, entry.name);
    if (entry.isDirectory()) items.push(...(await itemsBelow(onDisk, inZip)));
    else items.push({ name: inZip, data: await readFile(join(FIXTURE, onDisk)) });
  }
  return items;
}

/** The fixture as a zip; `extra` adds a file, so a second upload has another snapshot hash. */
export async function fixtureZip(extra?: ZipItem): Promise<Buffer> {
  const items = await itemsBelow('', ZIP_TOP_FOLDER);
  return buildZip(extra === undefined ? items : [...items, extra]);
}

/** The second version of the project: one more file below the same top-level folder. */
export const secondVersion: ZipItem = {
  name: `${ZIP_TOP_FOLDER}/NOTES.txt`,
  data: 'The second version of the zip.\n',
};

/** Chooses a zip in the form on the page and presses Upload zip; waits for what was kept. */
export async function uploadZip(page: Page, fileName: string, buffer: Buffer): Promise<void> {
  await page
    .getByLabel('Zip file')
    .setInputFiles({ name: fileName, mimeType: 'application/zip', buffer });
  await page.getByRole('button', { name: 'Upload zip' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'files kept' })).toBeVisible({
    timeout: 60_000,
  });
}

/** RF-128: makes the project in the Upload a zip tab and follows Start a run to its start page. */
export async function uploadFromNewProject(
  page: Page,
  fileName: string,
  buffer: Buffer,
): Promise<void> {
  await page.goto('/projects');
  await page.getByRole('tab', { name: 'Upload a zip' }).click();
  await uploadZip(page, fileName, buffer);
  await page.getByRole('link', { name: 'Start a run' }).click();
  await expect(page.getByRole('heading', { name: 'Start a run', level: 1 })).toBeVisible();
}

/** Opens the start page of the account's uploaded project from the projects list. */
export async function openUploadedStart(page: Page, projectName: string): Promise<void> {
  await page.goto('/projects');
  await page.getByRole('link', { name: `Start run for ${projectName}` }).click();
  await expect(page.getByRole('heading', { name: 'Start a run', level: 1 })).toBeVisible();
}

/** From the start page: a scan, then an understand run of the Catalog area; returns the run's path. */
export async function scanAndUnderstandCatalog(page: Page): Promise<string> {
  await runScan(page);
  await page.getByRole('link', { name: 'Start page' }).click();
  await chooseAreas(page, ['Catalog']);
  const path = await startAndOpenLiveRun(page);
  await expect(runStatus(page)).toContainText('Completed', { timeout: 60_000 });
  return path;
}

/** The addresses of the links of the page, as the browser resolves them. */
export async function linksOf(page: Page): Promise<readonly URL[]> {
  const hrefs = await page.$$eval('a[href]', (anchors) =>
    anchors.map((anchor) => anchor.getAttribute('href') ?? ''),
  );
  return hrefs.map((href) => new URL(href, page.url()));
}

/** RF-131: every link of the page stays on Rosetta's own origin, and none names GitHub. */
export async function expectLinksStayInRosetta(page: Page): Promise<void> {
  const origin = new URL(page.url()).origin;
  const links = await linksOf(page);
  expect(links.length).toBeGreaterThan(0);
  for (const link of links) {
    expect(link.origin, `${link.href} leaves Rosetta`).toBe(origin);
    expect(link.href).not.toContain('github.com');
  }
}

/** The evidence-page citation links a Markdown file holds, resolved against where the file is served. */
export function citationLinksIn(markdown: string, fileUrl: URL): readonly URL[] {
  const found = [...markdown.matchAll(/\]\(([^)\s]*card-[^)\s]*\.html#[^)\s]*)\)/gu)];
  return found.map((match) => new URL(match[1] ?? '', fileUrl));
}

/** RF-131: the link opens the evidence page of its card, at the cited claim and lines. */
export async function expectCitationOpensEvidence(page: Page, link: URL): Promise<void> {
  const cardId = /card-([^/]+)\.html$/u.exec(link.pathname)?.[1] ?? '';
  await page.goto(link.href);
  expect(new URL(page.url()).origin).toBe(link.origin);
  const heading = page.getByRole('heading', { name: new RegExp(`^${cardId}\\b`, 'u') });
  await expect(heading).toBeVisible();
  await expect(page.locator(':target')).toHaveAttribute('id', link.hash.slice(1));
  await expect(page.locator(':target')).toBeVisible();
}

/** The snapshot hash the open report names (RF-131). */
export async function snapshotHashOfReport(page: Page): Promise<string> {
  const hash = page.getByText(/^sha256:[0-9a-f]{64}$/u);
  await expect(hash).toBeVisible();
  return (await hash.textContent()) ?? '';
}

/** RF-132: gives the reader role a cloud provider in Project settings and returns to the start page. */
export async function giveReaderToOpenAi(page: Page): Promise<void> {
  await page.getByRole('link', { name: 'Project settings' }).click();
  await page.getByLabel('Reader provider', { exact: true }).selectOption('openai');
  await page.getByLabel('Reader model', { exact: true }).fill('gpt-5-nano');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByText('Settings saved.')).toBeVisible();
  await page.getByRole('link', { name: 'Start a run' }).click();
  await page.getByRole('radio', { name: 'Understand', exact: true }).check();
}
