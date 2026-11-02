import { readFile } from 'node:fs/promises';
import { filesOf, readZip } from '../../support/zip-reader.js';
import { expect, test } from '../support/fixtures.js';
import { chooseAreas, openProjectStart, repositories, runScan } from '../support/journey-pages.js';
import { runStatus, startAndOpenLiveRun } from '../support/live-run-page.js';
import { writeButton } from '../support/plan-setup-page.js';
import { accountFor } from '../support/seed.js';
import { signInThroughPage } from '../support/sign-in-page.js';

// RF-1020, RF-1021, RF-209, DEC-204: from a finished understand run to a downloaded package the user
// stays on the project page. The strip is there with History and the project settings one click away;
// Deepen is offered in place (and can be skipped), the questions and the plan setup are answered in
// place with one click, and "Start the plan" starts the plan, whose live page then offers the package.

test('RF-1020 RF-1021 from a finished understand to a downloaded package without leaving the project page', async ({
  page,
}, info) => {
  test.setTimeout(300_000);
  await signInThroughPage(page, accountFor('journey-run', `${info.project.name}/next-step`));
  await expect(page).toHaveURL(/\/projects$/u);
  await openProjectStart(page, repositories.webforms);
  await runScan(page);
  await openProjectStart(page, repositories.webforms);
  await chooseAreas(page, ['Catalog']);
  await startAndOpenLiveRun(page);
  await expect(runStatus(page)).toContainText('Completed', { timeout: 60_000 });

  await openProjectStart(page, repositories.webforms);
  const projectPage = page.url();
  const strip = page.getByRole('region', { name: 'Journey from code to package' });
  await expect(strip).toBeVisible();
  await expect(strip.getByRole('link', { name: 'Past runs' })).toBeVisible();
  await expect(strip.getByRole('link', { name: 'Settings for this project' })).toBeVisible();

  // Deepen is offered in place and never starts by itself; the user goes on to the questions.
  const skip = strip.getByRole('button', { name: /^Do not Deepen/u });
  if (await skip.isVisible()) {
    await expect(strip.getByRole('button', { name: 'Start Deepen' })).toBeVisible();
    await skip.click();
  }

  const setup = page.getByRole('region', { name: 'Questions and plan setup' });
  await expect(setup).toBeVisible();
  await setup.getByRole('button', { name: 'Accept the recommended answers' }).click();
  await expect(writeButton(page)).toBeEnabled();
  expect(page.url()).toBe(projectPage);

  await writeButton(page).click();
  await expect(page.getByRole('heading', { name: 'Live run', level: 1 })).toBeVisible({
    timeout: 30_000,
  });
  await expect(runStatus(page)).toContainText('Completed', { timeout: 90_000 });
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: 'Download hand-off zip' }).click(),
  ]);
  const files = filesOf(await readZip(await readFile(await download.path())));
  expect(Object.keys(files).length).toBeGreaterThan(0);
});
