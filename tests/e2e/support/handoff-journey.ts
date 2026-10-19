import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { filesOf, readZip } from '../../support/zip-reader.js';
import { expectNoSeriousViolations } from './axe.js';
import { expect } from './fixtures.js';
import { chooseAreas, openProjectStart, repositories, runScan } from './journey-pages.js';
import { runStatus, startAndOpenLiveRun } from './live-run-page.js';
import { openPlanSetup, recorded, writeButton } from './plan-setup-page.js';

// RF-010, RF-604, RF-605, RF-610, RF-601, P3-12: the steps of the release 1 journeys (flows 1 and 7
// of docs/process-flows.md), written as a person does them. The repository is `octo/webforms`,
// the C# fixture the test server's fake GitHub serves as a recorded snapshot (serve.ts); every
// model answer is a recording of e2e-provider.ts.

/** From the address of the repository to an understood Catalog area, then Plan setup for it. */
export async function understandFromUrl(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/projects$/u);
  await openProjectStart(page, repositories.webforms);
  await runScan(page);
  await openProjectStart(page, repositories.webforms);
  await chooseAreas(page, ['Catalog']);
  await startAndOpenLiveRun(page);
  await expect(runStatus(page)).toContainText('Completed', { timeout: 60_000 });
  await openProjectStart(page, repositories.webforms);
  await openPlanSetup(page);
}

/** Saves the brief from the step that is open: the last step's Save, the others' Save and continue. */
export async function saveBrief(page: Page): Promise<void> {
  const save = page.getByRole('button', { name: 'Save', exact: true });
  const next = page.getByRole('button', { name: 'Save and continue' });
  await ((await save.isVisible()) ? save : next).click();
  await expect(recorded(page)).toBeVisible();
}

/** Writes the package from Plan setup, waits for the plan run and downloads its hand-off zip. */
export async function writeAndDownload(page: Page): Promise<Readonly<Record<string, string>>> {
  await expect(writeButton(page)).toBeEnabled();
  await writeButton(page).click();
  await expect(page.getByRole('heading', { name: 'Live run', level: 1 })).toBeVisible();
  await expect(runStatus(page)).toContainText('Completed', { timeout: 90_000 });
  await expectNoSeriousViolations(page);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: 'Download hand-off zip' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/-plan-handoff\.zip$|handoff\.zip$/u);
  const path = await download.path();
  return filesOf(await readZip(await readFile(path)));
}

/** The text of a file of the package, wherever the zip puts its folder. */
export function packageFile(files: Readonly<Record<string, string>>, name: string): string {
  const path = Object.keys(files).find((file) => file === name || file.endsWith(`/${name}`));
  if (path === undefined)
    throw new Error(`The package has no ${name}: ${Object.keys(files).join(', ')}`);
  return files[path] ?? '';
}

/** A file of the package without its Markdown escapes (a hyphen in a name is written \-). */
export function plainFile(files: Readonly<Record<string, string>>, name: string): string {
  return packageFile(files, name).replaceAll('\\', '');
}

/** Every decision record of the package, joined, without the Markdown escapes. */
export function decisionsOf(files: Readonly<Record<string, string>>): string {
  return Object.entries(files)
    .filter(([path]) => /(^|\/)decisions\//u.test(path))
    .map(([, text]) => text.replaceAll('\\', ''))
    .join('\n');
}

/** RF-611: the optional project questions; unanswered, each is listed in open-questions.md with its default. */
export const projectContextIds = [
  'context.teamSize',
  'context.experience',
  'context.deadline',
  'context.keepIntegrations',
  'context.dataMigration',
] as const;

/** RF-612: the ids of the brief questions the package says took their default (open-questions.md). */
export function defaultedBriefIds(files: Readonly<Record<string, string>>): readonly string[] {
  const text = packageFile(files, 'open-questions.md').replaceAll('\\', '');
  const section = text.split('## Planning brief questions that took their default')[1] ?? '';
  const rows = (section.split('\n## ')[0] ?? '')
    .split('\n')
    .filter((line) => line.startsWith('| '));
  return rows.slice(1).map((row) => (row.split(' | ')[1] ?? '').trim());
}

/** RF-601: the requirements of requirements.md that name no source card. */
export function untracedRequirements(files: Readonly<Record<string, string>>): readonly string[] {
  const sections = packageFile(files, 'requirements.md').split('\n## ').slice(1);
  return sections
    .filter((section) => !/^Source cards: \[/mu.test(section))
    .map((section) => section.split('\n')[0] ?? '');
}
