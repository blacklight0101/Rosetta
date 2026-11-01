import { fireEvent, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { json } from './fake-api.js';
import { ev, runEnded, startedData } from './live-run-fixtures.js';
import { renderLive, runPath, runRow } from './live-run-helpers.js';
import { codeMapAnswer, codeMapPath, ownAreas } from './live-run-running-helpers.js';

// RF-1015, RF-1002, RF-1003 (P7-25): the page of a plan run shows that the planner is working (the
// call, the time since it started, the tokens so far), shows plan figures only, and a failed plan
// run points to the plan's own next action.

beforeEach(() => {
  // Ten seconds after the call below started (events are stamped 10:00:<seq>).
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-12T10:00:12.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const plan = { ...startedData, stage: 'plan' };
const usage = (seq: number, task: string, tokens: number, costMicros: number) =>
  ev(
    seq,
    'usage.recorded',
    { role: 'planner', tokens: { inputTokens: tokens, outputTokens: 0 }, costMicros },
    task,
  );
const answers = {
  [`GET ${runPath}`]: runRow({ stage: 'plan' }),
  [`GET ${codeMapPath}`]: codeMapAnswer(ownAreas),
};

it('RF-1015 a planner call that runs shows its name, the time since it started and its tokens', async () => {
  const { stream } = renderLive(answers);
  const connection = await stream.connection();
  connection.event(ev(1, 'run.started', plan));
  connection.event(ev(2, 'plan.call.started', { call: 'prd' }, 'planner-prd'));
  connection.event(usage(3, 'planner-prd', 1200, 3000));
  connection.event(ev(4, 'plan.call.started', { call: 'prd' }, 'planner-prd'));

  const progress = await screen.findByTestId('plan-progress');
  await waitFor(() => {
    expect(progress.textContent).toContain('PRD');
    expect(progress.textContent).toContain('0:08');
    expect(progress.textContent).toContain('1,200 tokens so far');
  });
});

it('RF-1015 between two calls the page says which call comes next', async () => {
  const { stream } = renderLive(answers);
  const connection = await stream.connection();
  connection.event(ev(1, 'run.started', plan));
  connection.event(ev(2, 'plan.call.started', { call: 'package' }, 'planner-package'));
  connection.event(usage(3, 'planner-package', 900, 1000));

  const progress = await screen.findByTestId('plan-progress');
  await waitFor(() => {
    expect(progress.textContent).toContain('Next: PRD');
  });
});

it('RF-1015 a running plan run has no Agents, Cards or Claims panel, and lists its planner calls', async () => {
  const { stream } = renderLive(answers);
  const connection = await stream.connection();
  connection.event(ev(1, 'run.started', plan));
  connection.event(ev(2, 'plan.call.started', { call: 'package' }, 'planner-package'));
  connection.event(usage(3, 'planner-package', 900, 1_000_000));
  connection.event(ev(4, 'plan.call.started', { call: 'prd' }, 'planner-prd'));

  const calls = await screen.findByRole('tab', { name: /^Planner calls/u });
  expect(screen.queryByRole('tab', { name: /^All agents/u })).toBeNull();
  expect(screen.queryByRole('tab', { name: /^Cards so far/u })).toBeNull();
  expect(screen.queryByRole('region', { name: 'Working now' })).toBeNull();
  fireEvent.click(calls);
  const panel = screen.getByRole('tabpanel');
  await waitFor(() => {
    expect(within(panel).getByText('Plan package')).toBeTruthy();
    expect(panel.textContent).toContain('900');
    expect(panel.textContent).toContain('$1.00');
  });
});

const endedPlan = (endState: string) => ({
  [`GET ${runPath}`]: runRow({ stage: 'plan', queueState: 'Ended', endState }),
});
const turn = (): HTMLElement => screen.getByRole('region', { name: 'Your turn' });

it('RF-1015 an ended plan run shows plan figures and no understand figures', async () => {
  const { stream } = renderLive(endedPlan('Completed'));
  const connection = await stream.connection();
  connection.event(ev(1, 'run.started', plan));
  connection.event(ev(2, 'plan.call.started', { call: 'package' }, 'planner-package'));
  connection.event(usage(3, 'planner-package', 900, 1000));
  connection.event(runEnded(4, 'Completed'));

  await screen.findByRole('tab', { name: /^Planner calls/u });
  expect(screen.queryByRole('tab', { name: /^Evidence/u })).toBeNull();
  expect(screen.queryByRole('tab', { name: /^Your questions/u })).toBeNull();
  const facts = within(turn()).getByRole('list', { name: 'Run facts' });
  expect(facts.textContent).not.toContain('Cards');
  expect(facts.textContent).not.toContain('Citations passed');
  expect(facts.textContent).not.toContain('Areas read');
  expect(facts.textContent).toContain('Cost');
});

it('RF-1015 a failed plan run says Try the plan again, never Resume run', async () => {
  const { stream } = renderLive({
    ...endedPlan('Failed'),
    [`GET /api/errors/RST-1805`]: json(200, {
      code: 'RST-1805',
      message: 'Cut off.',
      nextStep: '',
    }),
  });
  const connection = await stream.connection();
  connection.event(ev(1, 'run.started', plan));
  connection.event(runEnded(2, 'Failed', 'RST-1805'));

  const button = await within(await screen.findByRole('region', { name: 'Your turn' })).findByRole(
    'button',
    { name: 'Try the plan again' },
  );
  expect(turn().textContent).not.toMatch(/resume run|appears once it completes/iu);
  fireEvent.click(button);
  expect(window.location.pathname).toBe('/projects/p-1/plan-setup');
});

it('RF-627 a plan run written with gaps points to checks.md in its Your turn', async () => {
  const { stream } = renderLive({
    ...endedPlan('Failed'),
    [`GET /api/errors/RST-1806`]: json(200, { code: 'RST-1806', message: 'Gaps.', nextStep: '' }),
  });
  const connection = await stream.connection();
  connection.event(ev(1, 'run.started', plan));
  connection.event(runEnded(2, 'Failed', 'RST-1806'));

  const found = await within(await screen.findByRole('region', { name: 'Your turn' })).findByText(
    /checks\.md/u,
  );
  expect(found).toBeTruthy();
});

const checks = json(200, {
  sections: [
    {
      title: 'Plan coverage',
      text: '2 items of 9 are built by no task card; the run is not complete.',
    },
    { title: 'Left out', text: 'Nothing was left out of the package.' },
  ],
});

it('RF-1015 a written package lists its checks, as the server sends them, in the Planner calls tab', async () => {
  const { stream } = renderLive({ ...endedPlan('Completed'), [`GET ${runPath}/checks`]: checks });
  const connection = await stream.connection();
  connection.event(ev(1, 'run.started', plan));
  connection.event(runEnded(2, 'Completed'));

  const panel = await screen.findByRole('tabpanel');
  expect(await within(panel).findByRole('heading', { name: 'Plan coverage' })).toBeTruthy();
  expect(panel.textContent).toContain('2 items of 9 are built by no task card');
  expect(within(panel).getByRole('heading', { name: 'Left out' })).toBeTruthy();
});

it('RF-627 a plan run written with gaps lists what checks.md says in its Your turn', async () => {
  const { stream } = renderLive({
    ...endedPlan('Failed'),
    [`GET /api/errors/RST-1806`]: json(200, { code: 'RST-1806', message: 'Gaps.', nextStep: '' }),
    [`GET ${runPath}/checks`]: checks,
  });
  const connection = await stream.connection();
  connection.event(ev(1, 'run.started', plan));
  connection.event(runEnded(2, 'Failed', 'RST-1806'));

  const found = await within(await screen.findByRole('region', { name: 'Your turn' })).findByText(
    /2 items of 9 are built by no task card/u,
  );
  expect(found).toBeTruthy();
});

it('RF-1015 a plan run whose package is not written asks the server for no checks', async () => {
  const { stream, calls } = renderLive(endedPlan('Failed'));
  const connection = await stream.connection();
  connection.event(ev(1, 'run.started', plan));
  connection.event(runEnded(2, 'Failed', 'RST-1805'));

  await screen.findByRole('tab', { name: /^Planner calls/u });
  expect(calls.some((call) => call.path === `${runPath}/checks`)).toBe(false);
});
