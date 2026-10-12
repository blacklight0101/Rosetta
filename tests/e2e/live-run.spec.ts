import { join } from 'node:path';
import { loadRecording } from '../../src/infrastructure/providers/fake/recording.js';
import { expect, test } from './support/fixtures.js';
import { expectNoSeriousViolations } from './support/axe.js';
import {
  agentPanel,
  openStartPage,
  runStatus,
  startAndOpenLiveRun,
  startUnderstand,
  valueOf,
} from './support/live-run-page.js';
import { accountFor } from './support/seed.js';
import { signInAs } from './support/sign-in.js';
import { transitionsDone } from './support/transitions.js';

// RF-1002, RF-1003, RF-424, RF-1004, DEC-103, RF-1006, RF-008, RF-1108, RF-1105, P1-35: the live run
// page, driven by real runs of the test server. The model double replays the recorded understand run
// of the C# fixture (e2e-provider.ts) and nothing of the API or the event stream is replaced, so what
// the page shows is what the server sent. The steps run in order: they share one project and one run
// at a time, and the last one changes the project's reader to a cloud model that has no key.

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ context }, info) => {
  await signInAs(context, accountFor('live-run', info.project.name));
});

/** The path of the live page of the understand run that finished (`/runs/<uuid>`). */
let finishedRun = '';

const recordingFile = join('tests', 'recordings', 'fake', 'understand-csharp-full.json');

/** Input and output tokens of the recorded calls with those indexes. */
async function recordedTokens(indexes: readonly number[]): Promise<number> {
  const recording = await loadRecording(recordingFile);
  return indexes.reduce((total, index) => {
    const attempt = recording.calls[index]?.attempts[0];
    if (attempt === undefined || !('response' in attempt)) throw new Error(`No call ${index}.`);
    const { inputTokens, outputTokens } = attempt.response.usage;
    return total + inputTokens + outputTokens;
  }, 0);
}

test('RF-1002 a scan run opens from the start notice, ends complete and offers its zip', async ({
  page,
}) => {
  await openStartPage(page);
  await page.getByLabel('Scan only').check();

  await startAndOpenLiveRun(page);

  await expect(runStatus(page)).toContainText('Completed', { timeout: 60_000 });
  await expect(page.getByText('This run has no agents')).toBeVisible();
  await expect(page.getByRole('log', { name: 'Event log' })).toContainText('scan.completed');
  await expect(page.getByRole('button', { name: 'Download hand-off zip' })).toBeDisabled();
  await expectNoSeriousViolations(page);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: 'Download zip' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/-scan\.zip$/u);
});

test('RF-1002 RF-1003 RF-424 an understand run fills one panel per agent, the overview, the log and the meter as it goes', async ({
  page,
}) => {
  const areas = ['(root)', 'Catalog', 'Database', 'Services'];
  finishedRun = await startUnderstand(page, areas);

  for (const area of areas) await expect(agentPanel(page, area)).toBeVisible();
  const root = agentPanel(page, '(root)');
  await expect(root).toContainText('reader');
  await expect(root).toContainText('read_file Default.aspx.cs:1-14');
  await expect(page.getByRole('region', { name: 'Overview' })).toContainText('Running');
  await expectNoSeriousViolations(page);
  await transitionsDone(page);

  await expect(runStatus(page)).toContainText('Completed', { timeout: 60_000 });
  const overview = page.getByRole('region', { name: 'Overview' });
  await expect(valueOf(overview, 'Done')).toHaveText('4');
  await expect(valueOf(overview, 'Failed')).toHaveText('0');
  await expect(valueOf(overview, 'Running')).toHaveText('0');
  await expect(valueOf(root, 'Turns')).toHaveText('2');
  await expect(valueOf(root, 'Files read')).toHaveText('1');
  await expect(root).toContainText('FEAT-001');
  await expect(root).toContainText('OQ-001');
  const log = page.getByRole('log', { name: 'Event log' });
  await expect(log).toContainText('agent.tool.called');
  await expect(log).toContainText('agent.card.proposed');
  await expect(log.getByRole('listitem').first()).toContainText('run.ended');
  const tokens = await recordedTokens([0, 1, 2, 4, 5, 6, 7]);
  const meter = page.getByRole('region', { name: 'Run meter' });
  await expect(meter.getByRole('row', { name: /reader/u })).toContainText(
    tokens.toLocaleString('en-US'),
  );
  await expect(meter.getByRole('row', { name: /Total/u })).toContainText(
    tokens.toLocaleString('en-US'),
  );
  await expect(meter.getByRole('meter', { name: 'Run tokens against cap' })).toBeVisible();
  await expect(meter.getByRole('meter', { name: 'Run cost against cap' })).toBeVisible();
  await expect(meter).toContainText('Estimate');
  await expect(page.getByRole('link', { name: 'Download zip' })).toBeVisible();
  await expectNoSeriousViolations(page);
});

test('RF-1004 DEC-103 the claims list marks a claim awaiting model verification or citation invalid, with its reason and a link to the lines', async ({
  page,
}) => {
  await page.goto(finishedRun);

  const claims = page.getByRole('region', { name: 'Claims' });
  await expect(claims.getByTestId('claim')).toHaveCount(7);
  await expect(claims.getByTestId('claim').filter({ hasText: 'Citation invalid' })).toHaveCount(2);
  await expect(
    claims.getByTestId('claim').filter({ hasText: 'Awaiting model verification' }),
  ).toHaveCount(5);
  const missing = claims.getByTestId('claim').filter({ hasText: 'BR-001.c3' });
  await expect(missing).toContainText('Citation invalid');
  await expect(missing.getByTestId('claim-reason')).not.toBeEmpty();
  const lines = claims
    .getByTestId('claim')
    .filter({ hasText: 'BR-001.c1' })
    .getByRole('link', { name: 'Catalog/Details.aspx.cs:5-8' });
  await expect(lines).toHaveAttribute(
    'href',
    /^https:\/\/github\.com\/octo\/webforms\/blob\/[0-9a-f]{40}\/Catalog\/Details\.aspx\.cs#L5-L8$/u,
  );
  await expect(lines).toHaveAttribute('rel', /noopener/u);
  await expectNoSeriousViolations(page);
});

test('RF-1003 Stop ends a run that is working, keeps the cards that were found and enables the zip', async ({
  page,
}) => {
  await startUnderstand(page, ['Catalog', 'Controllers']);
  await expect(agentPanel(page, 'Catalog')).toContainText('Done', { timeout: 30_000 });
  await expect(agentPanel(page, 'Controllers')).toContainText('Running');
  await expect(page.getByRole('button', { name: 'Download zip' })).toBeDisabled();

  await page.getByRole('button', { name: 'Stop run' }).click();

  await expect(runStatus(page)).toContainText('Interrupted', { timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Stop run' })).toHaveCount(0);
  await expect(agentPanel(page, 'Catalog')).toContainText('BR-001');
  await expect(page.getByRole('link', { name: 'Download zip' })).toBeVisible();
  await expectNoSeriousViolations(page);
});

test('RF-1006 a page opened on a run under way replays what happened and goes on live, and reconnects from the last event', async ({
  page,
  context,
}) => {
  await startUnderstand(page, ['Catalog', 'Controllers']);
  await expect(agentPanel(page, 'Catalog')).toContainText('Done', { timeout: 30_000 });
  const asked: (string | undefined)[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/events')) asked.push(request.headers()['last-event-id']);
  });

  await page.reload();

  await expect(agentPanel(page, 'Catalog')).toContainText('Done');
  await expect(agentPanel(page, 'Catalog')).toContainText('BR-001');
  await expect(runStatus(page)).toContainText('Running');
  await context.setOffline(true);
  await expect(page.getByTestId('connection')).toContainText('Reconnecting', { timeout: 30_000 });
  await context.setOffline(false);
  await expect(page.getByTestId('connection')).toHaveCount(0, { timeout: 30_000 });
  expect(asked.filter((id) => id !== undefined && Number(id) > 0).length).toBeGreaterThan(0);
  await expect(agentPanel(page, 'Catalog')).toContainText('Done');
  await page.getByRole('button', { name: 'Stop run' }).click();
  await expect(runStatus(page)).toContainText('Interrupted', { timeout: 30_000 });
});

test('RF-1105 a run id that is not the account own shows the error and no page of a run', async ({
  page,
}) => {
  await page.goto('/runs/00000000-0000-4000-8000-000000000000');

  await expect(page.getByTestId('error-banner')).toContainText('RST-2003');
  await expect(page.getByTestId('run-status')).toHaveCount(0);
  await expectNoSeriousViolations(page);
});

test('RF-1108 RST-2302 a run refused for a missing key shows the code, the message and where to fix it', async ({
  page,
}) => {
  await openStartPage(page);
  await page.getByRole('link', { name: 'Project settings' }).click();
  await page.getByLabel('Reader provider', { exact: true }).selectOption('openai');
  await page.getByLabel('Reader model', { exact: true }).fill('gpt-5-nano');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByText('Settings saved.')).toBeVisible();
  await page.getByRole('link', { name: 'Start a run' }).click();
  await page.getByLabel('I understand; send masked excerpts to OpenAI for this run').check();

  await startAndOpenLiveRun(page);

  const refusal = page.getByTestId('run-failure');
  await expect(refusal).toContainText('RST-2302', { timeout: 30_000 });
  await expect(refusal).toContainText('There is no API key you may use for this provider.');
  await expect(refusal.getByRole('link', { name: 'Settings and keys' })).toBeVisible();
  await expect(runStatus(page)).toContainText('Failed');
  await transitionsDone(page);
  await expectNoSeriousViolations(page);
});
