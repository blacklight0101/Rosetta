import { expect, test } from './support/fixtures.js';
import { expectNoSeriousViolations } from './support/axe.js';
import {
  agentPanel,
  chooseSecondSuggestedAnswer,
  expectNotCovered,
  openQuestion,
  openRunTab,
  openStartPage,
  runStatus,
  startAndOpenLiveRun,
  startUnderstand,
  typeOwnAnswerWithKeyboard,
  valueOf,
} from './support/live-run-page.js';
import { expectMeterFromUsage } from './support/meter-usage.js';
import { accountFor } from './support/seed.js';
import { signInAs } from './support/sign-in.js';
import { transitionsDone } from './support/transitions.js';
import { chooseModel } from './support/choose-model.js';

// RF-1002, RF-1003, RF-424, RF-1004, RF-301, DEC-103, RF-1006, RF-008, RF-1108, RF-1105, P1-35: the live run page,
// driven by real runs of the test server. The model double replays the recorded understand run of the C# fixture
// (e2e-provider.ts); nothing of the API or the event stream is replaced. The steps run in order, sharing one run.

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ context }, info) => {
  await signInAs(context, accountFor('live-run', info.project.name));
});

/** The path of the live page of the understand run that finished (`/runs/<uuid>`). */
let finishedRun = '';

test('RF-1002 a scan run opens from the start notice, ends complete and offers its zip', async ({
  page,
}) => {
  await openStartPage(page);
  await page.getByLabel('Scan only').check();

  await startAndOpenLiveRun(page);

  await expect(runStatus(page)).toContainText('Completed', { timeout: 60_000 });
  await expect(page.getByText('This run has no agents')).toBeVisible();
  await openRunTab(page, 'Activity');
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
  await expect(root).toContainText('read_file Default.aspx:1-8');
  await expect(page.getByRole('region', { name: 'Overview' })).toContainText('Running');
  await expectNoSeriousViolations(page);
  await transitionsDone(page);

  await expect(runStatus(page)).toContainText('Completed', { timeout: 60_000 });
  // The run has ended: the page is in the after-the-run mode, and its agents are in the Evidence tab.
  await openRunTab(page, 'Evidence');
  const overview = page.getByRole('region', { name: 'Overview', exact: true });
  await expect(valueOf(overview, 'Done')).toHaveText('4');
  await expect(valueOf(overview, 'Failed')).toHaveText('0');
  await expect(valueOf(overview, 'Running')).toHaveText('0');
  await expect(valueOf(root, 'Turns')).toHaveText('2');
  await expect(valueOf(root, 'Files read')).toHaveText('3'); // P3-78: three files, half of the area
  await expect(root).toContainText('FEAT-001');
  await expect(root).toContainText('OQ-001');
  await expectMeterFromUsage(page, finishedRun, areas);
  const meter = page.getByRole('region', { name: 'Run meter' });
  await expect(meter.getByRole('meter', { name: 'Run tokens against cap' })).toBeVisible();
  await expect(meter.getByRole('meter', { name: 'Run cost against cap' })).toBeVisible();
  await expect(meter).toContainText('Estimate');
  await openRunTab(page, 'Activity');
  const log = page.getByRole('log', { name: 'Event log' });
  await expect(log).toContainText('agent.tool.called');
  await expect(log).toContainText('agent.card.proposed');
  await expect(log.getByRole('listitem').first()).toContainText('run.ended');
  await expect(page.getByRole('link', { name: 'Download zip' })).toBeVisible();
  await expectNoSeriousViolations(page);
});

test('RF-1004 RF-301 the claims list shows the recorded verdicts Supported and Rejected with their reasons, the citation invalid claims and a link to the lines', async ({
  page,
}) => {
  await page.goto(finishedRun);
  await openRunTab(page, 'Evidence');

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

test('RF-264 the overview of the application comes first on the page of a finished run, before the open questions', async ({
  page,
}) => {
  await page.goto(finishedRun);

  const overview = page.getByRole('region', { name: 'Overview of the application' });
  const questions = page.getByRole('region', { name: 'Open questions' });
  await expect(overview).toContainText('A catalog web site that lists items and shows one item.');
  await expect(overview.getByRole('link', { name: 'FEAT-001' }).first()).toBeVisible();
  await expect(overview).not.toContainText('send an email');
  // What was not covered, with the files no reader opened (P3-81);
  // the checks are in support/live-run-page.ts, which keeps this file under its size limit and
  // the lines the traceability matrix cites where they were.
  await expectNotCovered(overview.getByRole('region', { name: 'What was not covered' }));
  // The hostile statement is text: no script ran and nothing was injected into the page.
  await expect(overview.locator('script, img')).toHaveCount(0);
  await expect(overview).toContainText('<script>');
  // The overview is the first tab and open when the page opens; the questions come after it.
  const tabs = page.getByRole('tablist', { name: 'Results' }).getByRole('tab');
  await expect(tabs.first()).toHaveText('Overview');
  await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
  await expect(tabs.nth(1)).toContainText('Your questions');
  await expect(page.getByRole('region', { name: 'Your turn' })).toContainText('question');
  await expectNoSeriousViolations(page);
  await openRunTab(page, 'Your questions');
  const link = questions
    .getByTestId('open-question')
    .filter({ hasText: 'OQ-001' })
    .getByRole('link');
  await expect(link).toHaveAttribute('href', '#overview-application');
  await expectNoSeriousViolations(page);
  await link.click();
  await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
  await expect(overview).toBeVisible();
});

test('RF-645 RF-1007 a suggested answer, then an answer of your own, both chosen by keyboard, are saved in answers.md and there after a reload', async ({
  page,
}) => {
  const answer = 'Yes, a sold-out item stays in the list, greyed out.';
  const questionOf = () => openQuestion(page, 'OQ-001');
  await page.goto(finishedRun);
  await openRunTab(page, 'Your questions');
  await expect(questionOf()).toContainText('Open');
  await chooseSecondSuggestedAnswer(questionOf());
  await expectNoSeriousViolations(page);
  await typeOwnAnswerWithKeyboard(questionOf(), answer);

  await expect(questionOf()).toContainText('Answer saved in answers.md.');
  await expectNoSeriousViolations(page);
  await page.reload();
  await openRunTab(page, 'Your questions');
  await expect(questionOf().getByLabel('Answer to OQ-001')).toHaveValue(answer);
});

test('RF-241 an Answered question can be reopened on the page, with no serious violation', async ({
  page,
}) => {
  const answered = {
    ...{ cardId: 'OQ-001', question: 'Is a sold-out item still shown?', answer: 'Yes.' },
    ...{ context: 'Catalog/Default.aspx.cs:41-58 The list filters on stock.', state: 'Answered' },
    dependents: 0,
  };
  await page.route('**/api/runs/*/answers', (route) =>
    route.fulfill({ json: { questions: [answered] } }),
  );
  await page.route('**/api/runs/*/answers/OQ-001/reopen', (route) =>
    route.fulfill({ json: { questions: [{ ...answered, state: 'Open' }] } }),
  );
  await page.goto(finishedRun);
  await openRunTab(page, 'Your questions');
  const region = page.getByRole('region', { name: 'Open questions' });
  const question = region.getByTestId('open-question');
  await region.getByTestId('answered-questions').getByText('Answered (1)').click(); // RF-646
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
  await expect(page.getByRole('tablist', { name: 'Results' })).toBeVisible();
  await openRunTab(page, 'Evidence');
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
  await openRunTab(page, 'Evidence');
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

// P1-131: the test server holds a server key for OpenAI only, so the provider without one is Anthropic.
test('RF-1108 RST-2302 a run refused for a missing key shows the code, the message and where to fix it', async ({
  page,
}) => {
  await openStartPage(page);
  await page.getByRole('link', { name: 'Project settings' }).click();
  await page.getByLabel('Reader provider', { exact: true }).selectOption('anthropic');
  await chooseModel(page, 'Reader', 'claude-haiku-4-5');
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
