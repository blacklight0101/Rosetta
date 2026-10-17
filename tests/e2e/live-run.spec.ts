import type { Page } from '@playwright/test';
import { expect, test } from './support/fixtures.js';
import { expectNoSeriousViolations } from './support/axe.js';
import {
  agentPanel,
  openRunTab,
  openStartPage,
  runStatus,
  startAndOpenLiveRun,
  startUnderstand,
  valueOf,
} from './support/live-run-page.js';
import { hostileTexts, expectNothingInjected, watchDialogs } from './support/hostile-card.js';
import { recordedTokens, runTokens } from './support/run-tokens.js';
import { replayRunId } from './support/seed-replay.js';
import { accountFor } from './support/seed.js';
import { signInAs } from './support/sign-in.js';
import { transitionsDone } from './support/transitions.js';

// RF-1002, RF-1003, RF-424, RF-1004, RF-301, DEC-103, RF-1006, RF-008, RF-1108, RF-1105, P1-35: the live run
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

/**
 * P1-96, RF-301: the meter of a finished understand run. Each role's tokens come from its usage
 * events, so they cover every call the run made (the recorded reader calls and, for an Ollama
 * reader, its check before the first task; the verifier's recorded verdicts) and add up to the
 * totals the server keeps for the run.
 */
async function expectMeterFromUsage(page: Page, areas: readonly string[]): Promise<void> {
  const tokens = await runTokens(page, finishedRun);
  const verifier = await recordedTokens('verifier-csharp-full.json', [0, 1, 2, 3, 4]);
  const reader = await recordedTokens('understand-csharp-full.json', [0, 1, 2, 3, 6, 7, 8, 9, 10]);
  expect(tokens).toBeGreaterThanOrEqual(reader + verifier);
  const meter = page.getByRole('region', { name: 'Run meter' });
  const row = (name: RegExp) => meter.getByRole('row', { name });
  await expect(row(/reader/u)).toContainText((tokens - verifier).toLocaleString('en-US'));
  await expect(row(/verifier/u)).toContainText(verifier.toLocaleString('en-US'));
  await expect(row(/Total/u)).toContainText(tokens.toLocaleString('en-US'));
  const costCell = (name: RegExp) => row(name).getByRole('cell').last();
  await expect(costCell(/reader/u)).toHaveText(/^\$\d+\.\d+$/u);
  await expect(costCell(/Total/u)).toHaveText(/^\$\d+\.\d+$/u);
  for (const area of areas)
    await expect(valueOf(agentPanel(page, area), 'Cost')).toHaveText(/^\$/u);
  await expect(meter).not.toContainText('shows a dash');
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

  await expect(page.getByRole('list', { name: 'Run progress' })).toBeVisible();
  await openRunTab(page, 'All agents');
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
  await expectMeterFromUsage(page, areas);
  const meter = page.getByRole('region', { name: 'Run meter' });
  await expect(meter.getByRole('meter', { name: 'Run tokens against cap' })).toBeVisible();
  await expect(meter.getByRole('meter', { name: 'Run cost against cap' })).toBeVisible();
  await expect(meter).toContainText('Estimate');
  await expect(page.getByRole('link', { name: 'Download zip' })).toBeVisible();
  await expectNoSeriousViolations(page);
});

test('RF-1004 RF-301 the claims list shows the recorded verdicts Supported and Rejected with their reasons, the citation invalid claims and a link to the lines', async ({
  page,
}) => {
  await page.goto(finishedRun);

  const claims = page.getByRole('region', { name: 'Claims' });
  const claim = (text: string) => claims.getByTestId('claim').filter({ hasText: text });
  await expect(claims.getByTestId('claim')).toHaveCount(7);
  const counts = { 'Citation invalid': 2, Supported: 4, Rejected: 1 };
  for (const [text, count] of Object.entries(counts)) await expect(claim(text)).toHaveCount(count);
  // RF-1014: the judgement step is built and has ended, so nothing waits and nothing says "later".
  await expect(claims).not.toContainText(/later version|Waiting for judgement|not judged/u);
  await expect(claim('BR-001.c1')).toContainText('Supported');
  const reason = (id: string) => claim(id).getByTestId('claim-reason');
  await expect(reason('BR-001.c1')).toHaveText(
    'Line 7 sets NameLabel.Text to "Item" inside Page_Load.',
  );
  await expect(claim('BR-002.c1')).toContainText('Rejected');
  await expect(reason('BR-002.c1')).toContainText('nothing in the lines runs it.');
  await expect(claim('BR-001.c3')).toContainText('Citation invalid');
  await expect(reason('BR-001.c3')).not.toBeEmpty();
  const lines = claim('BR-001.c1').getByRole('link', { name: 'Catalog/Details.aspx.cs:5-8' });
  await expect(lines).toHaveAttribute(
    'href',
    /^https:\/\/github\.com\/octo\/webforms\/blob\/[0-9a-f]{40}\/Catalog\/Details\.aspx\.cs#L5-L8$/u,
  );
  await expect(lines).toHaveAttribute('rel', /noopener/u);
  await expectNoSeriousViolations(page);
});

test('RF-1007 an answer typed on the page is saved in answers.md and is there after a reload', async ({
  page,
}) => {
  const answer = 'Yes, a sold-out item stays in the list, greyed out.';
  const questionOf = () =>
    page
      .getByRole('region', { name: 'Open questions' })
      .getByTestId('open-question')
      .filter({ hasText: 'OQ-001' });
  await page.goto(finishedRun);
  await expect(questionOf()).toContainText('Open');

  await questionOf().getByLabel('Answer to OQ-001').fill(answer);
  await questionOf().getByRole('button', { name: 'Save answer' }).click();

  await expect(questionOf()).toContainText('Answer saved in answers.md.');
  await expectNoSeriousViolations(page);
  await page.reload();
  await expect(questionOf().getByLabel('Answer to OQ-001')).toHaveValue(answer);
});

test('RF-241 an Answered question can be reopened on the page, with no serious violation', async ({
  page,
}) => {
  const answered = {
    ...{ cardId: 'OQ-001', question: 'Is a sold-out item still shown?', answer: 'Yes.' },
    ...{ context: 'Catalog/Default.aspx.cs:41-58 The list filters on stock.', state: 'Answered' },
  };
  await page.route('**/api/runs/*/answers', (route) =>
    route.fulfill({ json: { questions: [answered] } }),
  );
  await page.route('**/api/runs/*/answers/OQ-001/reopen', (route) =>
    route.fulfill({ json: { questions: [{ ...answered, state: 'Open' }] } }),
  );
  await page.goto(finishedRun);
  const question = page
    .getByRole('region', { name: 'Open questions' })
    .getByTestId('open-question');
  await expect(question).toContainText('Answered');

  await question.getByRole('button', { name: 'Reopen question' }).click();

  await expect(question).toContainText('Question reopened.');
  await expect(question.getByRole('button', { name: 'Reopen question' })).toHaveCount(0);
  await expectNoSeriousViolations(page);
});

test('RF-1003 Stop ends a run that is working, keeps the cards that were found and enables the zip', async ({
  page,
}) => {
  await startUnderstand(page, ['Catalog', 'Controllers']);
  await openRunTab(page, 'All agents');
  await expect(agentPanel(page, 'Catalog')).toContainText('Done', { timeout: 30_000 });
  await expect(agentPanel(page, 'Controllers')).toContainText('Running');
  await expect(page.getByRole('button', { name: 'Download zip' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Stop run' }).click();

  await expect(runStatus(page)).toContainText('Interrupted', { timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Stop run' })).toHaveCount(0);
  await expect(agentPanel(page, 'Catalog')).toContainText('BR-001');
  await expect(page.getByRole('link', { name: 'Download zip' })).toBeVisible();
  await expectNoSeriousViolations(page);
});

test('RF-1006 a page opened on a run under way replays what happened and goes on live', async ({
  page,
}) => {
  await startUnderstand(page, ['Catalog', 'Controllers']);
  await openRunTab(page, 'All agents');
  await expect(agentPanel(page, 'Catalog')).toContainText('Done', { timeout: 30_000 });
  await openRunTab(page, 'Activity');
  await expect(page.getByRole('log', { name: 'Event log' })).toContainText('agent.ended');

  await page.reload();

  await openRunTab(page, 'All agents');
  await expect(agentPanel(page, 'Catalog')).toContainText('Done');
  await expect(agentPanel(page, 'Catalog')).toContainText('BR-001');
  await expect(runStatus(page)).toContainText('Running');
  await openRunTab(page, 'Activity');
  await expect(page.getByRole('log', { name: 'Event log' })).toContainText('run.started');
  await page.getByRole('button', { name: 'Stop run' }).click();
  await expect(runStatus(page)).toContainText('Interrupted', { timeout: 30_000 });
  await expect(agentPanel(page, 'Controllers')).not.toContainText('Running');
});

test('RF-1006 a stream asked from an event number sends the stored events after it and ends with the run', async ({
  page,
}) => {
  const runUuid = finishedRun.split('/').at(-1) ?? '';

  await page.goto(finishedRun);
  await expect(runStatus(page)).toContainText('Completed');
  const reply = await page.evaluate(async (uuid) => {
    const response = await fetch(`/api/runs/${uuid}/events`, {
      headers: { 'last-event-id': '10' },
    });
    return { status: response.status, body: await response.text() };
  }, runUuid);

  expect(reply.status).toBe(200);
  const body = reply.body;
  const ids = Array.from(body.matchAll(/^id: (\d+)$/gmu), (match) => Number(match[1]));
  expect(ids.length).toBeGreaterThan(1);
  expect(ids[0]).toBe(11);
  expect(ids).toEqual(ids.map((_, index) => 11 + index));
  expect(body).toContain('event: run.ended');
});

test('RF-507 RF-1002 the hostile card of a recorded run is text on the live page: nothing runs and no element is injected', async ({
  page,
  context,
}, info) => {
  await signInAs(context, accountFor('replay', info.project.name));
  const dialogs = watchDialogs(page);

  await page.goto(`/runs/${replayRunId(info.project.name)}`);

  await expect(runStatus(page)).toContainText('Completed');
  await transitionsDone(page);
  await expect(page.locator('body')).toContainText(hostileTexts.script);
  await expect(page.locator('body')).toContainText(hostileTexts.image);
  await expect(page.locator('body')).toContainText(hostileTexts.link);
  await expect(page.locator('body')).toContainText(hostileTexts.svg);
  await expectNothingInjected(page, dialogs);
  await expectNoSeriousViolations(page);
});

// P1-131: the test server holds a server key for OpenAI only, so the provider without one is Anthropic.
test('RF-1108 RST-2302 a run refused for a missing key shows the code, the message and where to fix it', async ({
  page,
}) => {
  await openStartPage(page);
  await page.getByRole('link', { name: 'Project settings' }).click();
  await page.getByLabel('Reader provider', { exact: true }).selectOption('anthropic');
  await page.getByLabel('Reader model', { exact: true }).fill('claude-haiku-4-5');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByText('Settings saved.')).toBeVisible();
  await page.getByRole('link', { name: 'Start a run' }).click();
  await page.getByLabel('I understand; send masked excerpts to Anthropic for this run').check();

  await startAndOpenLiveRun(page);

  const refusal = page.getByTestId('run-failure');
  await expect(refusal).toContainText('RST-2302', { timeout: 30_000 });
  await expect(refusal).toContainText('There is no API key you may use for this provider.');
  await expect(refusal.getByRole('link', { name: 'Settings and keys' })).toBeVisible();
  await expect(runStatus(page)).toContainText('Failed');
  await transitionsDone(page);
  await expectNoSeriousViolations(page);
});
