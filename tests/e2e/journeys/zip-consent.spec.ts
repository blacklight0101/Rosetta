import type { Page, Request, Response } from '@playwright/test';
import { expect, test } from '../support/fixtures.js';
import { saveBrief } from '../support/handoff-journey.js';
import { chooseAreas, runScan } from '../support/journey-pages.js';
import { openRunTab, RUN_DONE, runStatus, startAndOpenLiveRun } from '../support/live-run-page.js';
import { fixtureKeyEndingIn } from '../support/no-full-key.js';
import { openStep, writeButton } from '../support/plan-setup-page.js';
import { accountFor } from '../support/seed.js';
import { signInThroughPage } from '../support/sign-in-page.js';
import { projectIdOf } from '../support/start-run-page.js';
import { chooseModel } from '../support/choose-model.js';
import { fixtureZip, uploadFromNewProject } from '../support/zip-journey.js';

// RF-143, RF-209, RF-605, RF-142, DEC-209, P8-83 (UX-16, UX-27, UX-29, EV-98): on a project analysed
// from a zip whose reader and planner are in the cloud, the consent and the private-code confirmation
// are given once, at the start of the understand run. The Deepen panel of the ended run and Plan setup
// then show the one consent line instead of the boxes, and the Deepen and the plan start under that
// consent without sending it again and without a refusal (RST-1515, RST-1521). The account is the
// test's own (and the repeat's own), with its own fixture key, so it writes no server-wide state and
// runs on no server key; the model double replays the recorded runs (e2e-provider.ts).

const projectName = 'ConsentDesk';
const consentBox = /^I understand/u;
const consentLine = /^You agreed on /u;
const refusalCodes = /RST-15(15|21)/u;

/** Every API answer the test sees that refused a request, with its body. */
function collectRefusals(page: Page): Promise<string>[] {
  const refusals: Promise<string>[] = [];
  page.on('response', (response: Response) => {
    if (response.status() < 400 || !response.url().includes('/api/')) return;
    const where = `${response.request().method()} ${response.url()} ${String(response.status())}`;
    refusals.push(
      response.text().then(
        (body) => `${where} ${body}`,
        () => where,
      ),
    );
  });
  return refusals;
}

/** The next POST to a path that matches, as the page sends it. */
function nextPost(page: Page, path: RegExp): Promise<Response> {
  return page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && path.test(new URL(response.url()).pathname),
    { timeout: 30_000 },
  );
}

/** The JSON body a page sent. */
function bodyOf(request: Request): Record<string, unknown> {
  const body: unknown = request.postDataJSON();
  return typeof body === 'object' && body !== null ? Object.fromEntries(Object.entries(body)) : {};
}

/** RF-1104: the account's own OpenAI key, so the runs do not use the server's key and its caps. */
async function saveOwnOpenAiKey(page: Page): Promise<void> {
  await page.goto('/settings');
  const row = page
    .getByTestId('key-row')
    .filter({ has: page.getByRole('heading', { name: 'OpenAI', level: 3, exact: true }) });
  await row.getByLabel('API key').fill(fixtureKeyEndingIn('consent', 'CNS1'));
  await row.getByRole('button', { name: 'Save key' }).click();
  await expect(row).toContainText('CNS1');
}

/** RF-132: the reader and the planner in the cloud, from the start page of the project. */
async function readerAndPlannerToOpenAi(page: Page): Promise<void> {
  await page.getByRole('link', { name: 'Project settings', exact: true }).click();
  await page.getByLabel('Reader provider', { exact: true }).selectOption('openai');
  await chooseModel(page, 'Reader', 'gpt-5-nano');
  await page.getByLabel('Planner provider', { exact: true }).selectOption('openai');
  await chooseModel(page, 'Planner', 'gpt-5-nano');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByText('Settings saved.')).toBeVisible();
  await page.getByRole('link', { name: 'Start a run' }).click();
}

/** RF-143, RF-132: the understand run of Catalog, starting with both boxes ticked; its run id. */
async function understandWithConsent(page: Page): Promise<string> {
  await chooseAreas(page, ['Catalog']);
  const cloud = page.getByLabel(/^I understand; send masked excerpts to .*OpenAI/u);
  const own = page.getByLabel(
    new RegExp(`^I understand that my own code from ${projectName} will be sent to `, 'u'),
  );
  await expect(cloud).toBeVisible({ timeout: 30_000 });
  await cloud.check();
  await own.check();
  const started = nextPost(page, /^\/api\/projects\/[^/]+\/runs$/u);
  const path = await startAndOpenLiveRun(page);
  const start = await started;
  expect(start.ok()).toBe(true);
  expect(bodyOf(start.request())).toMatchObject({ cloudConsent: true, privateCodeConfirmed: true });
  await expect(runStatus(page)).toContainText(RUN_DONE, { timeout: 60_000 });
  const runId = /\/runs\/([0-9a-f-]{36})$/u.exec(path)?.[1];
  if (runId === undefined) throw new Error(`Not a run page: ${path}`);
  return runId;
}

/** RF-209, P8-81: the Deepen panel shows the line, no box, and the Deepen starts without either. */
async function deepenUnderTheConsent(page: Page): Promise<void> {
  await openRunTab(page, 'Evidence');
  const turn = page.getByRole('region', { name: 'Your turn' });
  await turn.getByRole('button', { name: 'Deepen this run' }).click();
  const panel = turn.getByRole('region', { name: 'Deepen this run' });
  await expect(panel.getByText(consentLine)).toBeVisible({ timeout: 30_000 });
  await expect(panel.getByRole('button', { name: 'Withdraw' })).toBeVisible();
  await expect(panel.getByLabel(consentBox)).toHaveCount(0);
  // One round, the one the journey's approved amount holds (RF-434).
  await panel.getByLabel('Rounds at most').selectOption('1');
  const parentUrl = page.url();
  await panel.getByRole('button', { name: 'Start Deepen' }).click();
  const started = nextPost(page, /^\/api\/runs\/[^/]+\/deepen$/u);
  await page
    .getByRole('dialog', { name: 'Start this Deepen?' })
    .getByRole('button', { name: 'Confirm and start' })
    .click();
  const start = await started;
  expect(start.ok()).toBe(true);
  expect(bodyOf(start.request())).toMatchObject({ cloudConsent: false });
  expect(bodyOf(start.request())).not.toHaveProperty('privateCodeConfirmed');

  await expect(page).not.toHaveURL(parentUrl);
  await expect(page).toHaveURL(/\/runs\/[0-9a-f-]{36}$/u);
  const progress = page.getByRole('region', { name: 'Deepen progress' });
  // The stop is the last of the Deepen events; the status of the page can lag the new run at first.
  await expect(progress.getByTestId('deepen-progress-stop')).toBeVisible({ timeout: 120_000 });
  await expect(runStatus(page)).toContainText(RUN_DONE, { timeout: 30_000 });
}

/** RF-605, P8-81: Plan setup shows the line, no box, and the plan starts without either. */
async function planUnderTheConsent(page: Page, projectId: string, runId: string): Promise<void> {
  await page.goto(`/projects/${projectId}/plan-setup?run=${runId}`);
  await expect(page.getByRole('heading', { name: 'Plan setup', level: 1 })).toBeVisible();
  await expect(page.getByText(consentLine)).toHaveCount(1, { timeout: 30_000 });
  await expect(page.getByText(consentLine)).toBeVisible();
  await expect(page.getByLabel(consentBox)).toHaveCount(0);
  await openStep(page, 'Build method');
  await saveBrief(page);

  await expect(writeButton(page)).toBeEnabled({ timeout: 30_000 });
  const started = nextPost(page, /^\/api\/projects\/[^/]+\/runs$/u);
  await writeButton(page).click();
  const start = await started;
  expect(start.ok()).toBe(true);
  expect(bodyOf(start.request())).toMatchObject({ stage: 'plan', cloudConsent: false });
  expect(bodyOf(start.request())).not.toHaveProperty('privateCodeConfirmed');
  await expect(
    page.getByRole('heading', { name: /^(Scan|Understand|Deepen|Plan|Run)\b/u, level: 1 }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(page).toHaveURL(/\/runs\/[0-9a-f-]{36}$/u);
  await expect(runStatus(page)).toContainText('Completed', { timeout: 90_000 });
}

test('RF-143 RF-209 RF-605 P8-83 a zip project runs understand, Deepen and plan with the consent given once and no refusal', async ({
  page,
}, info) => {
  // Four runs one after the other (scan, understand, Deepen, plan), each of which may wait for a
  // run slot of the one server while other workers' runs hold them: the budget of plan-run-page.
  test.setTimeout(300_000);
  const refusals = collectRefusals(page);
  await signInThroughPage(page, accountFor('journey-run', info.project.name));
  await expect(page).toHaveURL(/\/projects$/u);
  await saveOwnOpenAiKey(page);
  await uploadFromNewProject(page, `${projectName}.zip`, await fixtureZip());
  const projectId = projectIdOf(page);
  await runScan(page);
  await page.getByRole('link', { name: 'Start page' }).click();
  await readerAndPlannerToOpenAi(page);

  const runId = await understandWithConsent(page);
  await deepenUnderTheConsent(page);
  await planUnderTheConsent(page, projectId, runId);

  const refused = (await Promise.all(refusals)).filter((each) => refusalCodes.test(each));
  expect(refused).toEqual([]);
  await expect(page.getByText(refusalCodes)).toHaveCount(0);
});
