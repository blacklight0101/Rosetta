import { expectNoSeriousViolations } from '../support/axe.js';
import { expect, test } from '../support/fixtures.js';
import { downloadedRunFiles } from '../support/full-run-pages.js';
import { plainFile, saveBrief, writeAndDownload } from '../support/handoff-journey.js';
import { openRunTab } from '../support/live-run-page.js';
import { openPlanSetup, openStep } from '../support/plan-setup-page.js';
import { accountFor } from '../support/seed.js';
import { signInThroughPage } from '../support/sign-in-page.js';
import {
  citationLinksIn,
  expectCitationOpensEvidence,
  expectLinksStayInRosetta,
  fixtureZip,
  giveReaderToOpenAi,
  linksOf,
  openUploadedStart,
  scanAndUnderstandCatalog,
  secondVersion,
  snapshotHashOfReport,
  uploadFromNewProject,
  uploadZip,
} from '../support/zip-journey.js';

// RF-128, RF-130, RF-131, RF-132, RF-133, RNF-005, P3-42: the journey of a project analysed from a
// zip, end to end through the pages and the real server. The zip is made in the test from the C#
// fixture and uploaded through the Upload a zip tab; the run replays the recorded understand run
// (e2e-provider.ts). Every citation of the report, the package and the evidence page opens a
// Rosetta evidence page and no link leaves Rosetta. The tests run in order, on one account and one
// project: the second replaces the zip the first uploaded.

test.describe.configure({ mode: 'serial' });

const projectName = 'OrderDesk';
let firstHash = '';
let firstReport = '';
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

test('RF-128 RF-130 RF-131 a zip is uploaded, scanned and understood, and its report names the zip and opens only Rosetta pages', async ({
  page,
}, info) => {
  test.setTimeout(240_000);
  await signIn(page, info.project.name);
  await uploadFromNewProject(page, `${projectName}.zip`, await fixtureZip());
  await expectNoSeriousViolations(page);
  const runPath = await scanAndUnderstandCatalog(page);

  await openRunTab(page, 'Evidence');
  await expectLinksStayInRosetta(page);
  firstReport = await openReport(page);
  firstHash = await snapshotHashOfReport(page);
  await expect(page.getByText('OrderDesk.zip').first()).toBeVisible();
  await expect(page.getByText('Uploaded').first()).toBeVisible();
  await expectLinksStayInRosetta(page);
  await expectNoSeriousViolations(page);
  const markdown = await page.request.get(firstReport.replace('report.html', 'report.md'));
  expect(await markdown.text()).not.toContain('github.com');

  await page.goto(runPath);
  const files = await downloadedRunFiles(page);
  const origin = new URL(page.url()).origin;
  const citations = new Map<string, URL>();
  for (const [name, text] of Object.entries(files)) {
    expect(text, `${name} names GitHub`).not.toContain('github.com');
    const served = new URL(`files/${name}`, `${origin}${runPath}/`);
    for (const link of citationLinksIn(text, served)) citations.set(link.href, link);
  }
  expect(citations.size).toBeGreaterThanOrEqual(3);
  for (const link of citations.values()) await expectCitationOpensEvidence(page, link);
  await expectLinksStayInRosetta(page);
  expect((await linksOf(page)).length).toBeGreaterThan(0);
});

test('RF-132 the start page of an uploaded project with a cloud role asks a second time and keeps Start disabled until both boxes are ticked', async ({
  page,
}, info) => {
  await signIn(page, info.project.name);
  await openUploadedStart(page, projectName);
  await giveReaderToOpenAi(page);
  const start = page.getByRole('button', { name: /^Start run/u });
  const cloud = page.getByLabel('I understand; send masked excerpts to OpenAI for this run');
  const own = page.getByLabel(
    `I understand that my own code from ${projectName} will be sent to OpenAI`,
  );
  await expect(page.getByText('Your code is private.')).toBeVisible();
  await expect(start).toBeDisabled();
  await expectNoSeriousViolations(page);

  await cloud.check();
  await expect(start).toBeDisabled();
  await own.check();
  await expect(start).toBeEnabled();
  await cloud.uncheck();
  await expect(start).toBeDisabled();

  await page.getByRole('button', { name: 'Switch every role to Ollama' }).click();
  await expect(page.getByText('Your code is private.')).toHaveCount(0);
  await expect(page.getByText('Settings saved.').or(start)).toBeVisible();
});

test('RF-128 RF-131 an upload replaced between two runs gives a second report that names the new zip and its hash', async ({
  page,
}, info) => {
  test.setTimeout(240_000);
  await signIn(page, info.project.name);
  await openUploadedStart(page, projectName);

  await uploadZip(page, 'OrderDesk-v2.zip', await fixtureZip(secondVersion));

  await expect(page.getByText('The code changed since the last run.')).toBeVisible();
  await scanAndUnderstandCatalog(page);
  await openRunTab(page, 'Evidence');
  await expectLinksStayInRosetta(page);
  const secondReport = await openReport(page);
  secondHash = await snapshotHashOfReport(page);
  expect(secondHash).not.toBe(firstHash);
  await expect(page.getByText('OrderDesk-v2.zip').first()).toBeVisible();
  await expectLinksStayInRosetta(page);

  // The first run keeps the snapshot it read (RF-128).
  expect(secondReport).not.toBe(firstReport);
  await page.goto(firstReport);
  expect(await snapshotHashOfReport(page)).toBe(firstHash);
  await expect(page.getByText('OrderDesk.zip', { exact: true }).first()).toBeVisible();
});

test('RF-131 the hand-off package of an uploaded project names the zip and its hash and links nothing outside it', async ({
  page,
}, info) => {
  test.setTimeout(240_000);
  await signIn(page, info.project.name);
  await openUploadedStart(page, projectName);
  await openPlanSetup(page);
  await openStep(page, 'Build method');
  await saveBrief(page);

  const files = await writeAndDownload(page);

  const readme = plainFile(files, 'README.md');
  expect(readme).toContain('OrderDesk-v2.zip');
  expect(readme).toContain(secondHash);
  for (const [name, text] of Object.entries(files)) {
    expect(text, `${name} names GitHub`).not.toContain('github.com');
    expect(text, `${name} links an address outside the package`).not.toMatch(/\]\(https?:/u);
  }
});
