import type { Page } from '@playwright/test';
import { buildZip } from '../../support/zip-fixtures.js';
import { expect } from './fixtures.js';
import { downloadedRunFiles } from './full-run-pages.js';
import { chooseAreas, runScan } from './journey-pages.js';
import { runStatus, startAndOpenLiveRun } from './live-run-page.js';
import { citationLinksIn, expectCitationOpensEvidence } from './zip-journey.js';
import { discountsWorkbook, pricingWorkbook } from './workbook-fixtures-journey.js';

// RF-150, RF-156, P3-52: the steps of the journey of a project analysed from Excel workbooks, written
// as a person does them: the Excel workbooks tab of the New project form, the start page, the live
// run page. The two workbooks are built in the test (workbook-fixtures-journey.ts).

export interface WorkbookFile {
  readonly name: string;
  readonly mimeType: string;
  readonly buffer: Buffer;
}

const OCTET = 'application/octet-stream';

/** The diagram library the report bundles: its licence comments name github.com, the pages do not link it. */
const VENDORED_DIAGRAM_LIBRARY = 'report/mermaid.min.js';

/** What one citation of an evidence page shows: its name, the cells label beside it and its lines. */
export interface ShownCitation {
  readonly name: string;
  readonly label: string | undefined;
  readonly lines: string;
}

/** The two workbooks of the batch: Pricing.xlsm reads Discounts.xlsx. */
export async function journeyWorkbooks(retailRate?: number): Promise<readonly WorkbookFile[]> {
  return [
    { name: 'Pricing.xlsm', mimeType: OCTET, buffer: await pricingWorkbook() },
    { name: 'Discounts.xlsx', mimeType: OCTET, buffer: await discountsWorkbook(retailRate) },
  ];
}

/** Chooses the files in the form on the page and presses Upload workbooks; waits for what was read. */
export async function uploadWorkbooks(page: Page, files: readonly WorkbookFile[]): Promise<void> {
  await page.getByLabel('Workbook files').setInputFiles([...files]);
  await page.getByRole('button', { name: 'Upload workbooks' }).click();
  const read = `${String(files.length)} workbooks read`;
  await expect(page.getByRole('status').filter({ hasText: read })).toBeVisible({ timeout: 60_000 });
}

/** RF-150: makes the project in the Excel workbooks tab and follows Start a run to its start page. */
export async function uploadFromNewProject(
  page: Page,
  files: readonly WorkbookFile[],
): Promise<void> {
  await page.goto('/projects');
  await page.getByRole('tab', { name: 'Excel workbooks' }).click();
  await uploadWorkbooks(page, files);
  await page.getByRole('link', { name: 'Start a run' }).click();
  await expect(page.getByRole('heading', { name: 'Start a run', level: 1 })).toBeVisible();
}

/** Opens the start page of the account's workbook project from the projects list. */
export async function openWorkbookStart(page: Page, projectName: string): Promise<void> {
  await page.goto('/projects');
  await page.getByRole('link', { name: `Start run for ${projectName}` }).click();
  await expect(page.getByRole('heading', { name: 'Start a run', level: 1 })).toBeVisible();
}

/** From the start page: a scan, then an understand run of the named areas; returns the run's path. */
export async function scanAndUnderstand(page: Page, areas: readonly string[]): Promise<string> {
  await runScan(page);
  await page.getByRole('link', { name: 'Start page' }).click();
  await chooseAreas(page, areas);
  const path = await startAndOpenLiveRun(page);
  await expect(runStatus(page)).toContainText('Completed', { timeout: 60_000 });
  return path;
}

/** RF-156: the citation the address of the open evidence page points at (the one in :target). */
export async function targetCitation(page: Page): Promise<ShownCitation> {
  const target = page.locator(':target');
  await expect(target).toBeVisible();
  const label = target.locator('.citation-label');
  return {
    name: (await target.locator('.citation-name').first().innerText()).trim(),
    label: (await label.count()) === 0 ? undefined : (await label.first().innerText()).trim(),
    lines: await target.innerText(),
  };
}

/**
 * RF-156: opens every citation link the files of the run hold (as the zip journey does) and returns
 * what each evidence page shows beside the cited lines; each link is on Rosetta's own origin.
 */
export async function openEveryCitation(
  page: Page,
  runPath: string,
): Promise<readonly ShownCitation[]> {
  await page.goto(runPath);
  const origin = new URL(page.url()).origin;
  const files = await downloadedRunFiles(page);
  const links = new Map<string, URL>();
  for (const [name, text] of Object.entries(files)) {
    if (name !== VENDORED_DIAGRAM_LIBRARY) {
      expect(text, `${name} names GitHub`).not.toContain('github.com');
    }
    const served = new URL(`files/${name}`, `${origin}${runPath}/`);
    for (const link of citationLinksIn(text, served)) links.set(link.href, link);
  }
  const shown: ShownCitation[] = [];
  for (const link of links.values()) {
    await expectCitationOpensEvidence(page, link);
    shown.push(await targetCitation(page));
  }
  return shown;
}

/** The citation of a path and lines among those shown, or a failure that lists what was shown. */
export function citationOf(shown: readonly ShownCitation[], name: string): ShownCitation {
  const found = shown.find((citation) => citation.name === name);
  if (found === undefined) {
    throw new Error(
      `No evidence page shows ${name}; shown: ${shown.map((c) => c.name).join(', ')}`,
    );
  }
  return found;
}

/** A zip as a Compressed folder makes it: the Discounts workbook and a note, one level, no wrapper folder. */
export function zipWithWorkbook(): Promise<Buffer> {
  return discountsWorkbook().then((workbook) =>
    buildZip([
      { name: 'Discounts.xlsx', data: workbook },
      { name: 'NOTES.txt', data: 'The discounts of the order desk.' },
    ]),
  );
}
