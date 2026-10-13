import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { expect } from './fixtures.js';
import { openStartPage } from './live-run-page.js';
import { e2ePort } from './server-config.js';

// RF-1008, RF-1012, P1-40: what the history and snapshot journeys do, so the specs read as steps.

/** Opens the History page of the account's `octo/webforms` project through the side navigation. */
export async function openHistory(page: Page): Promise<void> {
  await openStartPage(page);
  await page.getByRole('navigation').getByRole('link', { name: 'History' }).click();
  await expect(page.getByRole('heading', { name: 'History', level: 1 })).toBeVisible();
}

/** The runs table of the History page. */
export function runsTable(page: Page): Locator {
  return page.getByRole('table', { name: 'Runs' });
}

/** The row of the runs table whose run id ends with `suffix` (`scan` or `understand`), newest first. */
export function runRow(page: Page, suffix: string): Locator {
  return runsTable(page).getByRole('row').filter({ hasText: suffix });
}

/** The confirmation dialog that is open. */
export function confirmation(page: Page): Locator {
  return page.getByRole('dialog');
}

/** The project folder named by the page, `projects/<uuid>`. */
export async function projectFolderOf(page: Page): Promise<string> {
  const section = page.getByRole('region', { name: 'Delete project' });
  const text = (await section.textContent()) ?? '';
  const folder = /projects\/[0-9a-f-]{36}/u.exec(text)?.[0];
  if (folder === undefined) throw new Error('The page does not name the project folder.');
  return folder;
}

/** The folder of the test server's downloaded snapshots (serve.ts: `<tmp>/rosetta-e2e-<port>`). */
function sourcesFolder(): string {
  return join(tmpdir(), `rosetta-e2e-${String(e2ePort())}`, 'sources');
}

/** A snapshot the way the fetcher leaves one: read-only, with its `snapshot.json`. */
export interface PlantedSnapshot {
  readonly key: string;
  readonly repository: string;
  readonly folder: string;
  readonly shortCommit: string;
}

const plantedSha = 'ab'.repeat(20);

/** Puts a snapshot of a repository of this Playwright project's own into the server's cache. */
export async function plantSnapshot(projectName: string): Promise<PlantedSnapshot> {
  const repo = `e2e-${projectName}`;
  const key = `octo__${repo}@${plantedSha}`;
  const folder = join(sourcesFolder(), key);
  await mkdir(folder, { recursive: true });
  const info = {
    ...{ owner: 'octo', repo, commitSha: plantedSha, fileCount: 1 },
    ...{ downloadedAt: '2026-10-11T09:11:00.000Z', totalBytes: 18_400_000 },
  };
  await writeFile(join(folder, 'snapshot.json'), JSON.stringify(info));
  await writeFile(join(folder, 'Program.cs'), 'class Program {}\n');
  await chmod(join(folder, 'Program.cs'), 0o444);
  await chmod(folder, 0o555);
  return { key, folder, repository: `octo/${repo}`, shortCommit: plantedSha.slice(0, 7) };
}
