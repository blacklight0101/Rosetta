import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { filesOf, readZip } from '../../support/zip-reader.js';
import { expect } from './fixtures.js';
import { chooseAreas, openProjectStart, repositories, runScan } from './journey-pages.js';
import { runStatus, startAndOpenLiveRun } from './live-run-page.js';
import { chooseModel } from './choose-model.js';

// P2-13: the steps the full-understand journeys share, written as a person does them: scan the
// webforms project, give the roles of the project a model (the name steers the model double,
// journey-models.ts), start the run on every area and read what it wrote.

/** The models a journey gives the roles of its project: the reader, and optionally the summariser. */
export interface JourneyModels {
  readonly reader: string;
  readonly summariser?: string;
  /** RF-615: the planner model, for a journey that needs a plan run to fail. */
  readonly planner?: string;
}

/** Opens the settings of the webforms project from its start page and saves the models. */
async function saveModels(page: Page, models: JourneyModels): Promise<void> {
  await page.getByRole('link', { name: 'Project settings', exact: true }).click();
  await chooseModel(page, 'Reader', models.reader);
  if (models.summariser !== undefined) {
    await chooseModel(page, 'Summariser', models.summariser);
  }
  if (models.planner !== undefined) {
    await chooseModel(page, 'Planner', models.planner);
  }
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByText('Settings saved.')).toBeVisible();
  await page.getByRole('link', { name: 'Start a run' }).click();
  await expect(page.getByRole('heading', { name: 'Start a run', level: 1 })).toBeVisible();
}

/** Scans the webforms project, gives its roles the models and leaves the start page open. */
export async function scanAndChooseModels(page: Page, models: JourneyModels): Promise<void> {
  await openProjectStart(page, repositories.webforms);
  await runScan(page);
  await openProjectStart(page, repositories.webforms);
  await saveModels(page, models);
}

/** Starts an understand run of every area and waits for it to end Completed; returns its path. */
export async function understandEveryArea(page: Page): Promise<string> {
  await chooseAreas(page, 'all');
  const path = await startAndOpenLiveRun(page);
  await expect(runStatus(page)).toContainText('Completed', { timeout: 120_000 });
  return path;
}

/** The files of the zip a run offers, by the path inside the run folder (`spec.md`, `cards/...`). */
export async function downloadedRunFiles(page: Page): Promise<Readonly<Record<string, string>>> {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: 'Download zip' }).click(),
  ]);
  const entries = filesOf(await readZip(await readFile(await download.path())));
  return Object.fromEntries(
    Object.entries(entries).map(([name, text]) => [name.slice(name.indexOf('/') + 1), text]),
  );
}
