import type { Page } from '@playwright/test';
import { expect, test } from './support/fixtures.js';
import { expectNoSeriousViolations } from './support/axe.js';
import { openScannedStartPage } from './support/cost-run.js';
import { accountFor } from './support/seed.js';
import { runStatus } from './support/live-run-page.js';
import { signInAs } from './support/sign-in.js';
import { transitionsDone } from './support/transitions.js';
import { chooseModel } from './support/choose-model.js';

// RF-1001, RF-143, RF-425, RF-1108, DEC-108, P1-34: the start page of a project, driven against
// the test server (fake GitHub for octo/demo, the answering provider for every model call). A scan
// and an understand run start from the page, the cloud notice needs its consent, a wrong address
// is refused next to its field, a likely estimate above the cap warns, and a second run waits in
// the real queue, shows its position and is cancelled by its id. The account belongs to the project (seed.ts); the steps run in order because they
// share its project and its runs.

const demoUrl = 'https://github.com/octo/demo';
const startButton = { name: /^Analyse/u } as const;
const consent = 'I understand; send masked excerpts to OpenAI for this run';

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ context }, info) => {
  await signInAs(context, accountFor('start-run', info.project.name));
});

async function openStartPage(page: Page): Promise<void> {
  await page.goto('/projects');
  const link = page.getByRole('link', { name: 'Start run for octo/demo' });
  const empty = page.getByText('No projects yet');
  await expect(link.or(empty)).toBeVisible();
  if (await empty.isVisible()) {
    await page.getByLabel('GitHub repository URL').fill(demoUrl);
    await page.getByRole('button', { name: 'Create project' }).click();
  }
  await link.click();
  await expect(page.getByRole('heading', { name: 'Start a run', level: 1 })).toBeVisible();
  await expect(page.getByLabel('GitHub repository URL')).toHaveValue(demoUrl);
}

function projectIdOf(page: Page): string {
  const id = /\/projects\/([^/]+)$/u.exec(new URL(page.url()).pathname)?.[1];
  if (id === undefined) throw new Error(`Not a start page: ${page.url()}`);
  return id;
}

test('RF-160 a project with no code map starts its scan by itself and passes axe', async ({
  page,
}) => {
  const logged: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') logged.push(message.text());
  });
  await openStartPage(page);

  await expect(page.getByTestId('scan-running')).toBeVisible();
  // P3-68: no estimate is asked for before a scan, so the browser logs no 409.
  expect(logged).toEqual([]);
  await expect(page.getByLabel('Scan only')).toHaveCount(0);
  await expectNoSeriousViolations(page);
  const estimate = `/api/projects/${projectIdOf(page)}/estimate`;
  // The estimate answers once the scan has completed and left its code map.
  await expect
    .poll(async () => page.evaluate(async (path) => (await fetch(path)).status, estimate), {
      timeout: 30_000,
    })
    .toBe(200);
});

test('RF-1001 shows the estimate and starts an understand run for the chosen areas', async ({
  page,
}) => {
  await openStartPage(page);

  const table = page.getByRole('table', { name: 'Estimate per role' });
  await expect(table.getByRole('row', { name: /reader/u })).toBeVisible();
  await expect(table.getByRole('row', { name: /Total/u })).toBeVisible();
  await expect(page.getByText(/Code will leave this machine/u)).toHaveCount(0);
  // P3-79, Q-51: the roles are local, so the estimate is in tokens against the token cap.
  await expect(table).not.toContainText('$');
  await expect(page.getByRole('meter')).toHaveAccessibleDescription(
    /run token cap of [\d,]+ tokens/u,
  );
  await expect(page.getByText(/Assumptions: \d+ areas?,/u)).toBeVisible();
  const areas = page.getByRole('group', { name: 'Areas from the code map' }).getByRole('checkbox');
  expect(await areas.count()).toBeGreaterThan(0);
  await areas.first().uncheck();
  await page.getByRole('button', { name: 'Re-estimate' }).click();
  await expect(table).toBeVisible();
  await expectNoSeriousViolations(page);
  await areas.first().check();
  await page.getByRole('button', startButton).click();

  await expect(page).toHaveURL(/\/runs\//u);
  await expectNoSeriousViolations(page);
});

test('RF-1108 a second run waits in the queue, shows its position and can be cancelled', async ({
  page,
}) => {
  // The test server holds the reader of an understand run for a few seconds (serve.ts), and one
  // user has at most one running run, so the second request really waits in the queue.
  await openStartPage(page);
  await page.getByRole('button', startButton).click();
  await expect(page).toHaveURL(/\/runs\//u);
  await openStartPage(page);

  await page.getByRole('button', startButton).click();

  // RF-1019: the queued run opens its live page, which says its place and can cancel it.
  await expect(page).toHaveURL(/\/runs\//u);
  await expect(runStatus(page)).toContainText('Queued');
  await expect(page.getByText(/position \d+/u).first()).toBeVisible();
  await expectNoSeriousViolations(page);
  await page.getByRole('button', { name: 'Cancel queued run' }).click();
  await expect(page.getByRole('button', { name: 'Cancel queued run' })).toHaveCount(0, {
    timeout: 30_000,
  });
});

test('RF-143 a cloud reader needs the consent before Start and the notice names the provider', async ({
  page,
}) => {
  await openStartPage(page);
  await page.getByRole('link', { name: 'Project settings', exact: true }).click();
  await page.getByLabel('Reader provider', { exact: true }).selectOption('openai');
  await chooseModel(page, 'Reader', 'gpt-5-nano');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByText('Settings saved.')).toBeVisible();
  await page.getByRole('link', { name: 'Start a run' }).click();

  const notice = page.getByRole('region', { name: 'Code will leave this machine' });
  await expect(notice).toContainText('OpenAI');
  // RF-132: a GitHub project is never asked the second, private-code confirmation.
  await expect(page.getByRole('region', { name: /Your code is private/u })).toHaveCount(0);
  const start = page.getByRole('button', startButton);
  await expect(start).toBeDisabled();
  await expect(start).toHaveText('Analyse (confirm the OpenAI notice)');
  await expectNoSeriousViolations(page);
  await page.getByLabel(consent).check();
  await expect(start).toBeEnabled();
  await transitionsDone(page);
  await expectNoSeriousViolations(page);
  await start.click();

  await expect(page).toHaveURL(/\/runs\//u);
});

test('RF-1001 a likely estimate above the run cap warns, names the cap and Start stays available', async ({
  page,
}) => {
  await openStartPage(page);
  // RF-436: the cap is the project settings'; the page warns against it and links to it.
  await page.getByRole('link', { name: 'Change the caps in the project settings' }).click();
  await page.getByLabel('Run cost cap (USD)', { exact: true }).fill('0.000001');
  await page.getByLabel('Ask before a run estimated above (USD)', { exact: true }).fill('0.000001');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByText('Settings saved.')).toBeVisible();
  await page.getByRole('link', { name: 'Start a run' }).click();
  await page.getByLabel(consent).check();

  const warning = page.getByTestId('cap-warning');
  await expect(warning).toContainText('run cap');
  await expect(warning).toContainText('$0.000001');
  await expect(page.getByRole('button', startButton)).toBeEnabled();
  await transitionsDone(page);
  await expectNoSeriousViolations(page);

  // The project keeps its settings between tests: put the default cap and threshold back.
  await page.getByRole('link', { name: 'Change the caps in the project settings' }).click();
  await page.getByLabel('Run cost cap (USD)', { exact: true }).fill('2.00');
  await page.getByLabel('Ask before a run estimated above (USD)', { exact: true }).fill('0.25');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByText('Settings saved.')).toBeVisible();
});

test('RF-1001 an invalid address is refused next to the field with its code and starts nothing', async ({
  page,
}) => {
  await openStartPage(page);
  const url = page.getByLabel('GitHub repository URL');

  await url.fill('https://example.com/octo/demo');
  await page.getByRole('button', { name: 'Resolve' }).click();

  await expect(page.getByTestId('field-error').filter({ hasText: 'RST-1900' })).toBeVisible();
  await expect(url).toHaveAttribute('aria-invalid', 'true');
  await expect(url).toBeFocused();
  await expect(page.getByTestId('run-notice')).toHaveCount(0);
  await expectNoSeriousViolations(page);
});

test('RF-1001 an address the account already has opens that project and makes no second one', async ({
  page,
}) => {
  const webformsUrl = 'https://github.com/octo/webforms';
  await page.goto('/projects');
  const webforms = page.getByRole('link', { name: 'Start run for octo/webforms' });
  if ((await webforms.count()) === 0) {
    await page.getByLabel('GitHub repository URL').fill(webformsUrl);
    await page.getByRole('button', { name: 'Create project' }).click();
    await expect(webforms).toBeVisible();
  }
  await openStartPage(page);
  const demoId = projectIdOf(page);

  await page.getByLabel('GitHub repository URL').fill(webformsUrl);
  await page.getByRole('button', { name: 'Resolve' }).click();

  await expect(page).not.toHaveURL(new RegExp(`/projects/${demoId}$`, 'u'));
  await expect(page.getByRole('heading', { name: 'Start a run', level: 1 })).toBeVisible();
  await expect(page.getByLabel('GitHub repository URL')).toHaveValue(webformsUrl);
  await expect(page.getByText('octo/webforms', { exact: true })).toBeVisible();
  await page.goto('/projects');
  await expect(page.getByRole('row').filter({ hasText: 'octo/webforms' })).toHaveCount(1);
});

test('RF-425 an unknown estimate query parameter is refused with a message that names it', async ({
  page,
}) => {
  await openStartPage(page);
  const path = `/api/projects/${projectIdOf(page)}/estimate?areas[]=Catalog`;

  const answer = await page.evaluate(async (url) => {
    const response = await fetch(url);
    return { status: response.status, body: await response.text() };
  }, path);

  expect(answer.status).toBe(400);
  expect(answer.body).toContain('RST-2000');
  expect(answer.body).toContain('Unknown query parameter \\"areas[]\\"');
});

test('RF-1001 a run cap below the confirm threshold is refused in the settings; a lower threshold lets the run start', async ({
  page,
}) => {
  // The reader runs on OpenAI with the server's key. The test scans the project when it has no code
  // map yet and sets the reader itself, as the consent test does, so it does not depend on the tests
  // before it (or on a .env file: the server reads none).
  // Q-57: on the reader's default output limit (8,192) the likely cost of the five webforms areas is
  // about $0.062 (8 turns x 2,458 output tokens per area), so a $0.05 threshold would open the "Start
  // this run?" question instead. The cap ($0.20) is below the default threshold ($0.25), and the
  // lower threshold ($0.15) stays well above the likely cost.
  await openScannedStartPage(page);
  await page.getByRole('link', { name: 'Project settings', exact: true }).click();
  await page.getByLabel('Reader provider', { exact: true }).selectOption('openai');
  await chooseModel(page, 'Reader', 'gpt-5-nano');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByText('Settings saved.')).toBeVisible();
  await page.getByRole('link', { name: 'Start a run' }).click();
  await expect(page.getByTestId('server-key-note')).toContainText(
    "OpenAI runs on the server's key",
  );
  const threshold = page.getByLabel('Ask before a run estimated above (USD)', { exact: true });
  await page.getByRole('link', { name: 'Change the caps in the project settings' }).click();
  await expect(threshold).toHaveValue('0.25');

  // RF-436: the cap and the threshold are the project settings'; the threshold may not be above the cap.
  await page.getByLabel('Run cost cap (USD)', { exact: true }).fill('0.20');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(threshold).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByText('Settings saved.')).toHaveCount(0);
  await transitionsDone(page);
  await expectNoSeriousViolations(page);
  await threshold.fill('0.15');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByText('Settings saved.')).toBeVisible();
  await page.getByRole('link', { name: 'Start a run' }).click();
  await page.getByLabel(consent).check();
  await page.getByRole('button', { name: /^Analyse/u }).click();

  // The run holds one of the server's run slots: stop it (or cancel it, when queued) and wait until
  // it has ended, so no other test's run waits behind it. The live page opened by itself (RF-1019).
  await expect(page.getByRole('heading', { name: 'Live run', level: 1 })).toBeVisible();
  const endOfRun = page.getByRole('button', { name: /^(Stop run|Cancel queued run)$/u });
  if (await endOfRun.isVisible()) await endOfRun.click();
  await expect(endOfRun).toHaveCount(0, { timeout: 60_000 });
  await page.getByRole('link', { name: 'Project settings', exact: true }).click();
  await expect(page.getByLabel('Run cost cap (USD)', { exact: true })).toHaveValue('0.20');
  await expect(threshold).toHaveValue('0.15');
});
