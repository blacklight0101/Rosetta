import { expect, test, type Page } from '@playwright/test';
import {
  chosenCredentials,
  demoUrl,
  firstCredentials,
  projectsOf,
  rememberRun,
  runEventTypes,
  startScan,
} from './stack.js';

// RF-1301, RF-1200, RF-1102, RF-010, RF-1303, P1-45: the smoke test of the Compose stack
// (compose.yaml with compose.ci.yaml), run by the compose-smoke job of CI against http://127.0.0.1:8080
// before the stack is restarted. A visitor opens the landing page, signs in as the bootstrap
// administrator, chooses a password, creates the demo project and scans it with the fake GitHub.
// persistence.spec.ts then checks, after `down` and `up`, that all of it is still there.

test.describe.configure({ mode: 'serial' });

let page: Page;

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
});

test.afterAll(async () => {
  await page.close();
});

test('RF-1303 /healthz answers ok', async () => {
  const response = await page.request.get('/healthz');

  expect(response.status()).toBe(200);
  expect(await response.json()).toMatchObject({ status: 'ok' });
});

test('RF-1200 the landing page opens and leads to sign-in', async () => {
  await page.goto('/');

  await expect(page).toHaveTitle(/Rosetta/u);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('legacy code');
  await page.getByRole('link', { name: 'Sign in to try it' }).click();
  await expect(page).toHaveURL(/\/sign-in$/u);
});

test('RF-1102 the bootstrap administrator signs in, chooses a password and reaches the projects', async () => {
  const first = firstCredentials();
  await page.getByLabel('User name').fill(first.userName);
  await page.getByLabel('Password', { exact: true }).fill(first.password);
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page).toHaveURL(/\/account\/password$/u);
  const chosen = chosenCredentials();
  await page.getByLabel('Temporary password').fill(first.password);
  await page.getByLabel('New password', { exact: true }).fill(chosen.password);
  await page.getByLabel('Repeat the new password').fill(chosen.password);
  await page.getByRole('button', { name: 'Save and continue' }).click();

  await expect(page).toHaveURL(/\/projects$/u);
  await expect(page.getByRole('heading', { name: 'Projects', level: 1 })).toBeVisible();
});

test('RF-010 creates the demo project', async () => {
  await page.getByLabel('GitHub repository URL').fill(demoUrl);
  await page.getByRole('button', { name: 'Create project' }).click();

  await expect(page.getByRole('row').filter({ hasText: 'octo/demo' })).toBeVisible();
});

test('RNF-005 a scan of the project completes against the fake GitHub', async () => {
  test.setTimeout(90_000);
  const [project] = await projectsOf(page);
  if (project === undefined) throw new Error('The demo project is missing.');

  const runId = await startScan(page, project.id);
  const types = await runEventTypes(page, runId);

  expect(types).toContain('source.downloaded');
  expect(types.at(-1)).toBe('run.ended');
  await rememberRun(runId);
});
