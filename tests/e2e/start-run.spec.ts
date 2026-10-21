import type { Page } from '@playwright/test';
import { expect, test } from './support/fixtures.js';
import { expectNoSeriousViolations } from './support/axe.js';
import { openScannedStartPage } from './support/cost-run.js';
import { accountFor } from './support/seed.js';
import { signInAs } from './support/sign-in.js';
import { transitionsDone } from './support/transitions.js';
import { chooseModel, setOutputLimit } from './support/choose-model.js';

// RF-1001, RF-143, RF-425, RF-1108, DEC-108, P1-34: the start page of a project, driven against
// the test server (fake GitHub for octo/demo, the answering provider for every model call). A scan
// and an understand run start from the page, the cloud notice needs its consent, a wrong address
// is refused next to its field, a likely estimate above the cap warns, and a second run waits in
// the real queue, shows its position and is cancelled by its id. The account belongs to the project (seed.ts); the steps run in order because they
// share its project and its runs.

const demoUrl = 'https://github.com/octo/demo';
const startButton = { name: /^Start run/u } as const;
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
  const id = /\/projects\/([^/]+)\/start$/u.exec(new URL(page.url()).pathname)?.[1];
  if (id === undefined) throw new Error(`Not a start page: ${page.url()}`);
  return id;
}

test('RF-1001 starts a scan from the page before there is a code map and passes axe', async ({
  page,
}) => {
  const logged: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') logged.push(message.text());
  });
  await openStartPage(page);

  await expect(page.getByText(/Run a scan first/u)).toBeVisible();
  // P3-68: no estimate is asked for before a scan, so the browser logs no 409.
  expect(logged).toEqual([]);
  await expect(page.getByLabel('Understand')).toBeDisabled();
  await expect(page.getByLabel('Scan only')).toBeChecked();
  await expectNoSeriousViolations(page);
  await page.getByRole('button', startButton).click();

  await expect(page.getByTestId('run-notice')).toContainText(/Run started|Queued/u);
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

  await expect(page.getByLabel('Understand')).toBeChecked();
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

  await expect(page.getByTestId('run-notice')).toContainText(/Run started|Queued/u);
  await expectNoSeriousViolations(page);
});

test('RF-1108 a second run waits in the queue, shows its position and can be cancelled', async ({
  page,
}) => {
  // The test server holds the reader of an understand run for a few seconds (serve.ts), and one
  // user has at most one running run, so the second request really waits in the queue.
  await openStartPage(page);
  await page.getByRole('button', startButton).click();
  await expect(page.getByTestId('run-notice')).toContainText(/Run started|Queued/u);
  await openStartPage(page);
  await page.getByLabel('Scan only').check();

  await page.getByRole('button', startButton).click();

  const notice = page.getByTestId('run-notice');
  await expect(notice).toContainText('Queued');
  await expect(notice).toContainText(/position \d+/u);
  await expectNoSeriousViolations(page);
  await notice.getByRole('button', { name: 'Cancel queued run' }).click();
  await expect(notice).toContainText('cancelled');
  await expect(page.getByRole('button', startButton)).toBeEnabled();
});

test('RF-143 a cloud reader needs the consent before Start and the notice names the provider', async ({
  page,
}) => {
  await openStartPage(page);
  await page.getByRole('link', { name: 'Project settings' }).click();
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
  await expect(start).toHaveText('Start run (confirm the OpenAI notice)');
  await expectNoSeriousViolations(page);
  await page.getByLabel(consent).check();
  await expect(start).toBeEnabled();
  await transitionsDone(page);
  await expectNoSeriousViolations(page);
  await start.click();

  await expect(page.getByTestId('run-notice')).toContainText(/Run started|Queued/u);
});

test('RF-1001 a likely estimate above the run cap warns, names the cap and Start stays available', async ({
  page,
}) => {
  await openStartPage(page);
  await page.getByLabel(consent).check();

  await page.getByLabel('Run cap (USD)').fill('0.000001');

  const warning = page.getByTestId('cap-warning');
  await expect(warning).toContainText('run cap');
  await expect(warning).toContainText('$0.000001');
  await expect(page.getByRole('button', startButton)).toBeEnabled();
  await transitionsDone(page);
  await expectNoSeriousViolations(page);
});

test('RF-1001 an invalid address is refused next to the field with its code and starts nothing', async ({
  page,
}) => {
  await openStartPage(page);
  await page.getByLabel('Scan only').check();
  const url = page.getByLabel('GitHub repository URL');

  await url.fill('https://example.com/octo/demo');
  await page.getByRole('button', startButton).click();

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

  await expect(page).not.toHaveURL(new RegExp(`/projects/${demoId}/start$`, 'u'));
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

test('RF-1001 a run cap below the confirm threshold is refused before the request; a lower threshold lets it start', async ({
  page,
}) => {
  // The reader runs on OpenAI with the server's key. The test scans the project when it has no code
  // map yet and sets the reader itself, as the consent test does, so it does not depend on the tests
  // before it (or on a .env file: the server reads none).
  await openScannedStartPage(page);
  await page.getByRole('link', { name: 'Project settings' }).click();
  await page.getByLabel('Reader provider', { exact: true }).selectOption('openai');
  await chooseModel(page, 'Reader', 'gpt-5-nano');
  await setOutputLimit(page, 'Reader', 4096);
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByText('Settings saved.')).toBeVisible();
  await page.getByRole('link', { name: 'Start a run' }).click();
  await expect(page.getByTestId('server-key-note')).toContainText(
    "OpenAI runs on the server's key",
  );
  await page.getByLabel(consent).check();
  const threshold = page.getByLabel('Ask before a run estimated above (USD)', { exact: true });
  await expect(threshold).toHaveValue('0.25');

  await page.getByLabel('Run cap (USD)').fill('0.10');
  await page.getByRole('button', startButton).click();

  await expect(threshold).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByText(/must not be above the run cap/u)).toBeVisible();
  await expect(page.getByTestId('run-notice')).toHaveCount(0);
  await transitionsDone(page);
  await expectNoSeriousViolations(page);
  await threshold.fill('0.05');
  await page.getByRole('button', startButton).click();

  const notice = page.getByTestId('run-notice');
  await expect(notice).toContainText(/Run started|Queued/u);
  // The run holds one of the server's run slots: stop it (or cancel it, when queued) and wait until
  // it has ended, so no other test's run waits behind it.
  await notice.getByRole('link', { name: 'Open the live run' }).click();
  await expect(page.getByRole('heading', { name: 'Live run', level: 1 })).toBeVisible();
  const endOfRun = page.getByRole('button', { name: /^(Stop run|Cancel queued run)$/u });
  if (await endOfRun.isVisible()) await endOfRun.click();
  await expect(endOfRun).toHaveCount(0, { timeout: 60_000 });
  await page.getByRole('link', { name: 'Start page' }).click();
  await expect(page.getByLabel('Run cap (USD)')).toHaveValue('0.10');
  await expect(
    page.getByLabel('Ask before a run estimated above (USD)', { exact: true }),
  ).toHaveValue('0.05');
});
