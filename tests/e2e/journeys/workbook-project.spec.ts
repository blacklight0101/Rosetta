import { expectNoSeriousViolations } from '../support/axe.js';
import { expect, test } from '../support/fixtures.js';
import { plainFile, saveBrief, writeAndDownload } from '../support/handoff-journey.js';
import { openRunTab } from '../support/live-run-page.js';
import { openPlanSetup, openStep } from '../support/plan-setup-page.js';
import { accountFor } from '../support/seed.js';
import { signInThroughPage } from '../support/sign-in-page.js';
import {
  citationOf,
  journeyWorkbooks,
  openEveryCitation,
  openWorkbookStart,
  scanAndUnderstand,
  uploadFromNewProject,
  uploadWorkbooks,
  zipWithWorkbook,
} from '../support/workbook-journey.js';
import {
  expectLinksStayInRosetta,
  giveReaderToOpenAi,
  snapshotHashOfReport,
  uploadFromNewProject as uploadZipFromNewProject,
} from '../support/zip-journey.js';

// RF-150, RF-152, RF-153, RF-154, RF-155, RF-156, RF-157, RF-158, RNF-005, P3-52: the journey of a
// project analysed from Excel workbooks, end to end through the pages and the real server. Two
// workbooks are made in the test (workbook-fixtures-journey.ts) and uploaded through the Excel
// workbooks tab; the run replays the recorded understand run of understand-workbook-journey.json
// (e2e-provider.ts). Every citation of the report and the package opens a Rosetta evidence page that
// names the sheet and the cells, and no link leaves Rosetta. The tests run in order, on one account
// and one project: the second replaces the workbooks the first uploaded.

test.describe.configure({ mode: 'serial' });

const projectName = 'Pricing';
const areas = ['Pricing.xlsm', 'Discounts.xlsx'];
let firstHash = '';
let firstReport = '';
let firstRun = '';
let secondHash = '';

async function signIn(page: Parameters<typeof signInThroughPage>[0], project: string) {
  await signInThroughPage(page, accountFor('journey-run', project));
  await expect(page).toHaveURL(/\/projects$/u);
}

/** Builds the report from the page of the open run and opens it; returns its address. */
async function openReport(page: Parameters<typeof signInThroughPage>[0]): Promise<string> {
  await page.getByRole('button', { name: 'Build report' }).click();
  await page.getByRole('link', { name: 'Open the report', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Run report', level: 1 })).toBeVisible();
  return page.url();
}

test('RF-150 RF-152 RF-155 RF-156 two workbooks are uploaded, scanned and understood, and the report names them and opens only Rosetta pages', async ({
  page,
}, info) => {
  test.setTimeout(240_000);
  await signIn(page, info.project.name);
  await uploadFromNewProject(page, await journeyWorkbooks());
  await expect(page.getByText(/^Pricing \(Excel, 2 workbooks, \d+ \w{3} \d{4}\)$/u)).toBeVisible();
  await expectNoSeriousViolations(page);
  firstRun = await scanAndUnderstand(page, areas);

  await openRunTab(page, 'Evidence');
  await expectLinksStayInRosetta(page);
  firstReport = await openReport(page);
  firstHash = await snapshotHashOfReport(page);
  // Every claim of the run is Supported: the verifier double has no verdict of the webforms run for them.
  await expect(page.getByText(/^\d+ cards?, (\d+) claims?: \1 Supported\.$/u)).toBeVisible();
  const source = page.getByText(/^Excel workbooks: /u).first();
  await expect(source).toContainText('Pricing.xlsm');
  await expect(source).toContainText('Discounts.xlsx');
  await expectLinksStayInRosetta(page);
  await expectNoSeriousViolations(page);
  const markdown = await page.request.get(firstReport.replace('report.html', 'report.md'));
  expect(await markdown.text()).not.toContain('github.com');

  const shown = await openEveryCitation(page, firstRun);
  expect(shown.length).toBeGreaterThanOrEqual(6);
  await expectLinksStayInRosetta(page);
  expect(citationOf(shown, 'Pricing.xlsm/Quote/formulas.md:9-9').label).toBe(
    'Pricing.xlsm, sheet Quote, cells C2:C3',
  );
  expect(citationOf(shown, 'Pricing.xlsm/Quote/formulas.md:5-6').label).toBe(
    'Pricing.xlsm, sheet Quote, cells D2, D3',
  );
  expect(citationOf(shown, 'Pricing.xlsm/Quote/validation.md:6-6').label).toBe(
    'Pricing.xlsm, sheet Quote, cells A2:A3',
  );
  expect(citationOf(shown, 'Discounts.xlsx/Discounts/values.md:6-8').label).toBe(
    'Discounts.xlsx, sheet Discounts, cells A1, B1, A2, B2, A3, B3',
  );
});

test('RF-153 RF-154 the dependency map and the macro module of the snapshot are cited and shown as lines', async ({
  page,
}, info) => {
  test.setTimeout(120_000);
  await signIn(page, info.project.name);
  const shown = await openEveryCitation(page, firstRun);

  const map = citationOf(shown, 'dependencies.md:8-8');
  expect(map.label).toBeUndefined();
  expect(map.lines).toContain('Pricing.xlsm -> Discounts.xlsx: 2 formulas');
  const macro = citationOf(shown, 'Pricing.xlsm/macros/Module1.bas:2-6');
  expect(macro.label).toBeUndefined();
  expect(macro.lines).toContain('Sub ApplyTierDiscount()');
});

test('RF-157 the start page of a workbook project with a cloud role asks a second time and keeps Start disabled until both boxes are ticked', async ({
  page,
}, info) => {
  await signIn(page, info.project.name);
  await openWorkbookStart(page, projectName);
  await giveReaderToOpenAi(page);
  const start = page.getByRole('button', { name: /^Analyse/u });
  const cloud = page.getByLabel('I understand; send masked excerpts to OpenAI for this run');
  const own = page.getByLabel(
    `I understand that cell values, formulas and macros from ${projectName} will be sent to OpenAI`,
  );
  await expect(page.getByText('Your workbook data is private.')).toBeVisible();
  await expect(start).toBeDisabled();
  await expectNoSeriousViolations(page);

  await cloud.check();
  await expect(start).toBeDisabled();
  await own.check();
  await expect(start).toBeEnabled();
  await cloud.uncheck();
  await expect(start).toBeDisabled();

  await page.getByRole('button', { name: /^Switch every role to Ollama/u }).click();
  await expect(page.getByText('Your workbook data is private.')).toHaveCount(0);
});

test('RF-150 RF-156 workbooks replaced between two runs give a second report that names the new hash', async ({
  page,
}, info) => {
  test.setTimeout(240_000);
  await signIn(page, info.project.name);
  await openWorkbookStart(page, projectName);

  await uploadWorkbooks(page, await journeyWorkbooks(0.15));

  // The notice shows at once, from the flag the finish answer carries, with no reopening of the page.
  await expect(page.getByText('The code changed since the last run.')).toBeVisible();
  const runPath = await scanAndUnderstand(page, areas);
  const secondReport = await openReport(page);
  secondHash = await snapshotHashOfReport(page);
  expect(secondHash).not.toBe(firstHash);
  await expect(page.getByText(/^Excel workbooks: /u).first()).toContainText('Pricing.xlsm');
  await expectLinksStayInRosetta(page);
  const shown = await openEveryCitation(page, runPath);
  expect(citationOf(shown, 'Discounts.xlsx/Discounts/values.md:6-8').lines).toContain('0.15');

  // The first run keeps the snapshot it read (RF-150).
  expect(secondReport).not.toBe(firstReport);
  await page.goto(firstReport);
  expect(await snapshotHashOfReport(page)).toBe(firstHash);
});

test('RF-156 the hand-off package of a workbook project names the workbooks and their hash and links nothing outside it', async ({
  page,
}, info) => {
  test.setTimeout(240_000);
  await signIn(page, info.project.name);
  await openWorkbookStart(page, projectName);
  await openPlanSetup(page);
  await openStep(page, 'Build method');
  await saveBrief(page);

  const files = await writeAndDownload(page);

  const readme = plainFile(files, 'README.md');
  expect(readme).toContain('Pricing.xlsm');
  expect(readme).toContain('Discounts.xlsx');
  expect(readme).toContain(secondHash);
  for (const [name, text] of Object.entries(files)) {
    expect(text, `${name} names GitHub`).not.toContain('github.com');
    expect(text, `${name} links an address outside the package`).not.toMatch(/\]\(https?:/u);
  }
});

test('RF-150 RF-156 a zip that holds one of the workbooks is rendered in place and its citations name the sheet and cells', async ({
  page,
}, info) => {
  test.setTimeout(240_000);
  await signIn(page, info.project.name);
  await uploadZipFromNewProject(page, 'Notes.zip', await zipWithWorkbook());
  const runPath = await scanAndUnderstand(page, ['Discounts.xlsx']);

  await openReport(page);
  await expect(page.getByText('Notes.zip').first()).toBeVisible();
  await expectLinksStayInRosetta(page);
  const shown = await openEveryCitation(page, runPath);
  expect(citationOf(shown, 'Discounts.xlsx/Discounts/values.md:6-8').label).toBe(
    'Discounts.xlsx, sheet Discounts, cells A1, B1, A2, B2, A3, B3',
  );
});
