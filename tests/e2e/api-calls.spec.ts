import type { Locator, Page } from '@playwright/test';
import { expect, test } from './support/fixtures.js';
import { expectNoSeriousViolations } from './support/axe.js';
import { startUnderstand } from './support/live-run-page.js';
import { appendCalls, appendLogs, runFolderOf } from './support/run-folder.js';
import { accountFor } from './support/seed.js';
import { signInAs } from './support/sign-in.js';
import { transitionsDone } from './support/transitions.js';

// RF-1011, RF-408, RF-1105, P1-37: the "API calls" and "Logs" panels of a real understand run of the
// test server, which replays the recorded run of the C# fixture (e2e-provider.ts). Nothing of the
// API or the event stream is replaced. A retried call, a failed call and the log entries the
// recorded run does not make are appended to the run's own files, which the server reads back
// through its routes. The steps run in order: they share one project and one run.

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ context }, info) => {
  await signInAs(context, accountFor('api-calls', info.project.name));
});

/** The path of the live page of the run (`/runs/<uuid>`). */
let livePath = '';

const calls = (page: Page): Locator => page.getByRole('region', { name: 'API calls' });
const logs = (page: Page): Locator => page.getByRole('region', { name: 'Logs' });
const rows = (page: Page): Locator => calls(page).getByTestId('call-row');
const entries = (page: Page): Locator => logs(page).getByTestId('log-entry');

test('RF-1011 the calls of a run appear in the panel as it works, and the summary counts them', async ({
  page,
}) => {
  livePath = await startUnderstand(page, ['(root)', 'Catalog']);

  await page.getByRole('link', { name: 'API calls and logs' }).click();

  await expect(page.getByRole('heading', { name: 'API calls and logs', level: 1 })).toBeVisible();
  await expect(rows(page).first()).toBeVisible({ timeout: 30_000 });
  await expect(rows(page)).toHaveCount(3, { timeout: 60_000 });
  const summary = page.getByRole('region', { name: 'Summary per provider and role' });
  const row = summary.getByTestId('summary-row');
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('reader');
  await expect(row.getByRole('cell').nth(2)).toHaveText('3');
  await expect(calls(page).getByRole('button', { name: 'Next error' })).toBeDisabled();
  await transitionsDone(page);
  await expectNoSeriousViolations(page);
});

test('RF-1011 errors and retries are highlighted, filtered and reached with Next error', async ({
  page,
}) => {
  const folder = await runFolderOf(page, livePath.split('/').at(-1) ?? '');
  await appendCalls(folder, (first) => [
    { ...first, provider: 'cloud', kind: 'openai', role: 'verifier', status: 'retried', httpStatus: 429, errorCode: 'RST-1504', finishReason: 'error', latencyMs: 300, timeToFirstTokenMs: 0, inputTokens: 0, outputTokens: 0, callId: `${folder.runKey}#90`, attempt: 1 },
    { ...first, provider: 'cloud', kind: 'openai', role: 'verifier', status: 'ok', callId: `${folder.runKey}#90`, attempt: 2, latencyMs: 2000, timeToFirstTokenMs: 900 },
    { ...first, provider: 'cloud', kind: 'openai', role: 'verifier', status: 'failed', errorCode: 'RST-1505', finishReason: 'error', latencyMs: 30_000, timeToFirstTokenMs: 0, inputTokens: 0, outputTokens: 0, callId: `${folder.runKey}#91`, attempt: 1 },
  ]);

  await page.goto(`${livePath}/calls`);

  await expect(rows(page)).toHaveCount(6);
  await expect(rows(page).filter({ hasText: 'RST-1504' })).toHaveAttribute('data-problem', 'true');
  await expect(rows(page).filter({ hasText: 'RST-1505' })).toHaveAttribute('data-problem', 'true');
  const summary = page.getByRole('region', { name: 'Summary per provider and role' });
  await expect(summary.getByTestId('summary-row')).toHaveCount(2);
  await expect(summary.getByTestId('summary-row').filter({ hasText: 'cloud' })).toContainText(
    '1 retried, 1 failed',
  );
  await calls(page).getByLabel('Provider').selectOption('cloud');
  await expect(rows(page)).toHaveCount(3);
  await calls(page).getByLabel('Status').selectOption('problems');
  await expect(rows(page)).toHaveCount(2);
  await calls(page).getByLabel('Status').selectOption('');
  await calls(page).getByLabel('Provider').selectOption('');
  await calls(page).getByRole('button', { name: 'Next error' }).click();
  await expect(rows(page).filter({ hasText: 'RST-1504' })).toHaveAttribute('aria-current', 'true');
  await calls(page).getByRole('button', { name: 'Next error' }).click();
  await expect(rows(page).filter({ hasText: 'RST-1505' })).toHaveAttribute('aria-current', 'true');
  await transitionsDone(page);
  await expectNoSeriousViolations(page);
});

test('RF-1011 RF-408 the link of a call opens its masked transcript as text', async ({ page }) => {
  await page.goto(`${livePath}/calls`);
  await expect(rows(page).first()).toBeVisible();

  await rows(page).first().getByRole('link', { name: /^Transcript of call/u }).click();

  const selected = page.getByRole('region', { name: 'Selected call' });
  await expect(selected.getByTestId('transcript-message').first()).toBeVisible();
  await expect(selected.getByTestId('transcript-message').first()).toContainText('system');
  await transitionsDone(page);
  await expectNoSeriousViolations(page);
});

test('RF-1011 the Logs panel lists the entries of the run, filters them by level and counts the security events', async ({
  page,
}) => {
  const folder = await runFolderOf(page, livePath.split('/').at(-1) ?? '');
  await appendLogs(folder, [
    { level: 'debug', logger: 'agent', message: 'Turn detail for the debug level.' },
    { level: 'warn', logger: 'security', code: 'RST-2101', message: 'A secret was masked before it was sent.' },
    { level: 'error', logger: 'provider.openai', code: 'RST-1505', message: 'Timeout after 30 s.' },
  ]);

  await page.goto(`${livePath}/calls`);

  await expect(entries(page).filter({ hasText: 'Timeout after 30 s.' })).toBeVisible();
  await expect(logs(page)).not.toContainText('Turn detail for the debug level.');
  await logs(page).getByRole('button', { name: 'debug' }).click();
  await expect(logs(page)).toContainText('Turn detail for the debug level.');
  await logs(page).getByRole('button', { name: 'debug' }).click();
  const counter = logs(page).getByRole('button', { name: /Security events/u });
  await expect(counter).toContainText('1');
  await counter.click();
  await expect(entries(page)).toHaveCount(1);
  await expect(entries(page)).toContainText('A secret was masked before it was sent.');
  await transitionsDone(page);
  await expectNoSeriousViolations(page);
});

test("RF-1105 another user's run answers the same error as an unknown one, with no panel", async ({
  page,
  context,
}, info) => {
  await signInAs(context, accountFor('live-run', info.project.name));

  await page.goto(`${livePath}/calls`);

  await expect(page.getByText('RST-2003')).toBeVisible();
  await expect(page.getByRole('region', { name: 'API calls' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Logs' })).toHaveCount(0);
  await expectNoSeriousViolations(page);
});
