import { fireEvent, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, expect, it, vi } from 'vitest';
import { routes } from '../../../web/src/app/routes.js';
import { failure, json } from './fake-api.js';
import {
  agentEnded,
  agentStarted,
  cardProposed,
  ev,
  planned,
  runEnded,
  runKey,
  startedData,
  toolCalled,
  toolResult,
  turn,
} from './live-run-fixtures.js';
import {
  agentPanel,
  estimatePath,
  findAgentPanel,
  renderLive,
  runPath,
  runRow,
  runUuid,
  valueOf,
} from './live-run-helpers.js';
import { localEstimate } from './start-run-fixtures.js';

// RF-1002..RF-1006, RF-1108, RF-008, RF-507, DEC-103 (P1-35): the panels, overview, meter and Stop of the live run page. Whatever the page shows comes from
// the events the test pushes into the fake stream.

afterEach(() => {
  vi.unstubAllGlobals();
});

const retry = 'retry: 5\n\n';

it('RF-1002 the page is a signed-in page of the router table', () => {
  const route = routes.find((each) => each.path === '/runs/:runId');

  expect(route).toMatchObject({ access: 'user', chrome: 'shell', title: 'Live run' });
});

it('RF-1002 shows one panel per agent with area, role, model, state, turns, tool call, files, cards and tokens', async () => {
  const { stream } = renderLive();
  const connection = await stream.connection();

  connection.raw(retry);
  connection.event(ev(1, 'run.started', startedData));
  connection.event(planned(2, 'reader-001', 'Catalog'));
  connection.event(planned(3, 'reader-002', 'Services'));
  connection.event(agentStarted(4, 'reader-001', 'Catalog'));
  connection.event(turn(5, 'reader-001', 1, [900, 40]));
  connection.event(
    toolCalled(6, 'reader-001', { path: 'Catalog/Edit.aspx.cs', startLine: 40, endLine: 80 }),
  );

  const catalog = await findAgentPanel('Catalog');
  await waitFor(() => {
    expect(within(catalog).getByText('read_file Catalog/Edit.aspx.cs:40-80')).toBeTruthy();
  });
  expect(catalog.textContent).toContain('reader');
  expect(catalog.textContent).toContain('qwen3.5:9b');
  expect(catalog.textContent).toContain('Running');
  expect(valueOf(catalog, 'Turns')).toBe('1');
  expect(valueOf(catalog, 'Files read')).toBe('0');
  expect(valueOf(catalog, 'Tokens')).toBe('940');
  expect(agentPanel('Services').textContent).toContain('Planned');

  connection.event(toolResult(7, 'reader-001', true));
  connection.event(cardProposed(8, 'reader-001', 'BR-001'));
  connection.event(agentEnded(9, 'reader-001', 'Done', 1));
  await waitFor(() => {
    expect(valueOf(catalog, 'Files read')).toBe('1');
  });
  expect(catalog.textContent).toContain('Done');
  expect(within(catalog).getByText('BR-001')).toBeTruthy();
});

it('RF-1002 shows the overview of planned, running, done and failed agents and the verbose event log', async () => {
  const { stream } = renderLive();
  const connection = await stream.connection();

  connection.event(ev(1, 'run.started', startedData));
  connection.event(planned(2, 'reader-001', 'Catalog'));
  connection.event(planned(3, 'reader-002', 'Services'));
  connection.event(planned(4, 'reader-003', 'Models'));
  connection.event(agentStarted(5, 'reader-001', 'Catalog'));
  connection.event(agentStarted(6, 'reader-002', 'Services'));
  connection.event(agentEnded(7, 'reader-002', 'Failed'));

  const overview = await screen.findByRole('region', { name: 'Overview' });
  await waitFor(() => {
    expect(valueOf(overview, 'Failed')).toBe('1');
  });
  expect(valueOf(overview, 'Planned')).toBe('1');
  expect(valueOf(overview, 'Running')).toBe('1');
  expect(valueOf(overview, 'Done')).toBe('0');
  const items = within(screen.getByRole('log', { name: 'Event log' })).getAllByRole('listitem');
  expect(items).toHaveLength(7);
  expect(items[0]?.textContent).toContain('agent.ended');
  expect(items[0]?.textContent).toContain('00:06.0');
  expect(items.at(-1)?.textContent).toContain('run.started');
});

it('RF-1003 RF-424 shows tokens per role and in total, the cap as a bar, the cost so far and the estimate', async () => {
  let reads = 0;
  const { stream } = renderLive({
    [`GET ${runPath}`]: () => {
      reads += 1;
      return runRow({ costMicros: reads === 1 ? 0 : 4_100 });
    },
    [`GET ${estimatePath}`]: json(200, localEstimate),
  });
  const connection = await stream.connection();

  connection.event(ev(1, 'run.started', startedData));
  connection.event(planned(2, 'reader-001', 'Catalog'));
  connection.event(planned(3, 'reader-002', 'Services'));
  connection.event(agentStarted(4, 'reader-001', 'Catalog'));
  connection.event(turn(5, 'reader-001', 1, [900, 40]));
  connection.event(turn(6, 'reader-001', 2, [1_000, 60]));

  const meter = await screen.findByRole('region', { name: 'Run meter' });
  await waitFor(() => {
    expect(within(meter).getByRole('row', { name: /reader/u }).textContent).toContain('2,000');
  });
  expect(within(meter).getByRole('row', { name: /Total/u }).textContent).toContain('2,000');
  const tokens = within(meter).getByRole('meter', { name: 'Run tokens against cap' });
  expect(tokens.getAttribute('aria-valuenow')).toBe('20');
  expect(tokens.getAttribute('aria-valuetext')).toContain('10,000');
  await waitFor(() => {
    expect(within(meter).getByText('$0.0041')).toBeTruthy();
  });
  const cost = within(meter).getByRole('meter', { name: 'Run cost against cap' });
  expect(cost.getAttribute('aria-valuetext')).toContain('$2.00');
  await waitFor(() => {
    expect(meter.textContent).toContain('Estimate');
    expect(meter.textContent).toContain('44,000');
  });
});

it('RF-1003 Stop asks for the stop with the run id, says it is stopping, and the run ends as Interrupted', async () => {
  const { stream, calls } = renderLive({
    [`POST ${runPath}/stop`]: json(202, { id: runUuid, runId: runKey, stopRequested: true }),
  });
  const connection = await stream.connection();
  connection.event(ev(1, 'run.started', startedData));

  fireEvent.click(await screen.findByRole('button', { name: 'Stop run' }));

  await waitFor(() => {
    expect(calls.at(-1)).toMatchObject({ method: 'POST', path: `${runPath}/stop`, csrf: 'csrf-0' });
  });
  expect(await screen.findByText(/Stopping/u)).toBeTruthy();
  connection.event(runEnded(2, 'Interrupted'));
  await waitFor(() => {
    expect(screen.getByTestId('run-status').textContent).toContain('Interrupted');
  });
  expect(screen.queryByRole('button', { name: 'Stop run' })).toBeNull();
});

it('RF-1003 a refused Stop shows its code and leaves the button', async () => {
  const { stream } = renderLive({ [`POST ${runPath}/stop`]: failure(409, 'RST-2007') });
  const connection = await stream.connection();
  connection.event(ev(1, 'run.started', startedData));

  fireEvent.click(await screen.findByRole('button', { name: 'Stop run' }));

  expect((await screen.findByTestId('error-banner')).textContent).toContain('RST-2007');
  expect(screen.getByRole('button', { name: 'Stop run' })).toBeTruthy();
});

it('RF-1108 a queued run shows as queued, can be cancelled, and runs when its first event arrives', async () => {
  const { stream } = renderLive({
    [`GET ${runPath}`]: runRow({ queueState: 'Queued' }),
    [`POST ${runPath}/stop`]: json(200, { id: runUuid, runId: runKey, stopRequested: false }),
  });
  const connection = await stream.connection();

  expect((await screen.findByTestId('run-status')).textContent).toContain('Queued');
  expect(screen.getByRole('button', { name: 'Cancel queued run' })).toBeTruthy();
  connection.event(ev(1, 'run.started', startedData));

  await waitFor(() => {
    expect(screen.getByTestId('run-status').textContent).toContain('Running');
  });
  expect(screen.getByRole('button', { name: 'Stop run' })).toBeTruthy();
});
