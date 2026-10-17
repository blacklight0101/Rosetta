import { act, fireEvent, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, expect, it, vi } from 'vitest';
import {
  agentStarted,
  cardProposed,
  ev,
  planned,
  startedData,
  toolCalled,
  turn,
} from './live-run-fixtures.js';
import { renderLive, runPath, runRow } from './live-run-helpers.js';
import { codeMapAnswer, codeMapPath, ownAreas, tab } from './live-run-running-helpers.js';

// RF-1015, RF-1016, RF-1003, RF-507 (P1-169): the states of the page of a run while it runs that the
// first scenarios leave out: no caps, no code map, a scan, many cards, hostile text, a burst of
// events.

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const tiles = (): HTMLElement => screen.getByRole('list', { name: 'Areas of the code' });
const withMap = { [`GET ${codeMapPath}`]: codeMapAnswer(ownAreas) };

it('RF-1003 the spend says the caps are not known yet, and shows no bar, until the run names them', async () => {
  const { stream } = renderLive();
  const connection = await stream.connection();

  connection.event(ev(1, 'run.started', { stage: 'understand' }));

  const spend = await screen.findByRole('region', { name: 'Spend for this run' });
  expect(spend.textContent).toContain('The caps of the run are not known yet.');
  expect(within(spend).queryByRole('meter')).toBeNull();
  expect(spend.textContent).not.toContain('cap $');
});

it('RF-1003 the bar of the spend turns to the warning colour from 80 percent of the cap', async () => {
  const { stream } = renderLive({ [`GET ${runPath}`]: runRow({ costMicros: 1_700_000 }) });
  const connection = await stream.connection();

  connection.event(ev(1, 'run.started', startedData));

  const bar = await screen.findByRole('meter', { name: 'Spend against the cap' });
  await waitFor(() => {
    expect(bar.getAttribute('aria-valuenow')).toBe('85');
  });
  expect(bar.firstElementChild?.className).toContain('rst-live-meter__fill--warn');
});

it('RF-1016 a scan has no areas to draw yet, says so, and asks the server for no code map', async () => {
  const { stream, calls } = renderLive({ [`GET ${runPath}`]: runRow({ stage: 'scan' }) });
  const connection = await stream.connection();

  connection.event(ev(1, 'run.started', { ...startedData, stage: 'scan' }));

  expect(await screen.findByText('The areas appear when the scan has finished.')).toBeTruthy();
  expect(calls.some((call) => call.path === codeMapPath)).toBe(false);
});

it('RF-1016 a run whose code map cannot be read draws the areas of its own agents', async () => {
  const { stream } = renderLive();
  const connection = await stream.connection();

  connection.event(ev(1, 'run.started', startedData));
  connection.event(planned(2, 'r1', 'Catalog'));
  connection.event(planned(3, 'r2', 'Models'));

  await waitFor(() => {
    expect(within(tiles()).getAllByRole('listitem')).toHaveLength(2);
  });
  expect(within(tiles()).getByRole('button', { name: /Catalog/u }).textContent).toContain(
    'waiting',
  );
});

it('RF-1016 an area the run left out is not covered, and a run before its agents asks for none', async () => {
  const { stream } = renderLive(withMap);
  const connection = await stream.connection();

  connection.event(ev(1, 'run.started', startedData));
  await waitFor(() => {
    expect(within(tiles()).getByRole('button', { name: /Setup/u }).textContent).toContain(
      'waiting',
    );
  });
  connection.event(planned(2, 'r1', 'Catalog'));

  await waitFor(() => {
    expect(within(tiles()).getByRole('button', { name: /Setup/u }).textContent).toContain(
      'not covered',
    );
  });
});

it('RF-1016 a tile draws at most 24 marks however many cards its area has', async () => {
  const { stream } = renderLive(withMap);
  const connection = await stream.connection();
  connection.event(ev(1, 'run.started', startedData));
  connection.event(planned(2, 'r1', 'Catalog'));
  connection.event(agentStarted(3, 'r1', 'Catalog'));

  for (let index = 0; index < 30; index += 1) {
    connection.event(cardProposed(4 + index, 'r1', `BR-${String(index)}`, 1));
  }

  await waitFor(() => {
    expect(within(tiles()).getByRole('button', { name: /Catalog/u }).textContent).toContain(
      '30 cards',
    );
  });
  const marks = within(tiles())
    .getByRole('button', { name: /Catalog/u })
    .querySelectorAll('.rst-tile__pip');
  expect(marks).toHaveLength(24);
});

it('RF-1016 opening another tab after a tile shows every agent again', async () => {
  const { stream } = renderLive(withMap);
  const connection = await stream.connection();
  connection.event(ev(1, 'run.started', startedData));
  connection.event(planned(2, 'r1', 'Catalog'));
  connection.event(planned(3, 'r2', 'Models'));
  await waitFor(() => {
    expect(within(tiles()).getAllByRole('listitem').length).toBeGreaterThan(1);
  });
  fireEvent.click(within(tiles()).getByRole('button', { name: /Models/u }));
  expect(screen.queryByLabelText('Agent Catalog')).toBeNull();

  fireEvent.click(tab('Activity'));
  fireEvent.click(tab('All agents'));

  expect(screen.getByLabelText('Agent Catalog')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Show all agents' })).toBeNull();
});

it('RF-507 a card title and an area name with HTML are text in the cards, the tile and working now', async () => {
  const hostile = '<img src=x onerror=alert(1)>';
  const { stream, container } = renderLive({
    [`GET ${codeMapPath}`]: codeMapAnswer([
      { name: hostile, estimatedTokens: 100, thirdParty: false },
    ]),
  });
  const connection = await stream.connection();

  connection.event(ev(1, 'run.started', startedData));
  connection.event(planned(2, 'r1', hostile));
  connection.event(agentStarted(3, 'r1', hostile));
  connection.event(
    ev(4, 'agent.card.proposed', { cardId: 'BR-001', type: 'BR', title: hostile, claims: 1 }, 'r1'),
  );

  const now = await screen.findByRole('region', { name: 'Working now' });
  await waitFor(() => {
    expect(now.textContent).toContain(`Wrote a card: ${hostile}`);
  });
  expect(screen.getByTestId('card-row').textContent).toContain(hostile);
  expect(within(tiles()).getByText(hostile)).toBeTruthy();
  expect(container.querySelector('img')).toBeNull();
});

it('RF-1015 working now names a tool that is not a file read and the page gives the source and the model', async () => {
  const { stream } = renderLive();
  const connection = await stream.connection();

  connection.event(ev(1, 'run.started', startedData));
  connection.event(planned(2, 'r1', 'Catalog'));
  connection.event(agentStarted(3, 'r1', 'Catalog'));
  connection.event(toolCalled(4, 'r1', { pattern: 'UseMockData' }, 'grep'));

  const now = await screen.findByRole('region', { name: 'Working now' });
  await waitFor(() => {
    expect(now.textContent).toContain('Using grep "UseMockData"');
  });
  expect(screen.getByText('octo/demo @ 3f78685').className).toContain('rst-mono');
  expect(screen.getByText('qwen3.5:9b')).toBeTruthy();
});

it('RF-1015 working now says why nothing is at work: queued, not planned yet, or between agents', async () => {
  renderLive({ [`GET ${runPath}`]: runRow({ queueState: 'Queued' }) });
  const queued = await screen.findByRole('region', { name: 'Working now' });
  expect(queued.textContent).toContain('The run is waiting in the queue.');
  expect(queued.textContent).toContain('none');
});

it('RF-1015 working now says the agents start when the run has planned its work', async () => {
  const { stream } = renderLive();
  const connection = await stream.connection();

  connection.event(ev(1, 'run.started', startedData));

  const now = await screen.findByRole('region', { name: 'Working now' });
  await waitFor(() => {
    expect(now.textContent).toContain('The agents start when the run has planned its work.');
  });
  connection.event(planned(2, 'r1', 'Catalog'));
  await waitFor(() => {
    expect(now.textContent).toContain('No agent is working at this moment.');
  });
});

it('RF-1004 P1-166 500 events in ten seconds read the run at most once a second on the new page', async () => {
  // The fake timers come before the page: the refresh throttle starts a one second timer at mount, and a
  // real timer started earlier fires in real time (a slow machine reaches it mid-test) and runs a second
  // chain of reads next to the fake one. With every timer fake the count depends on the events only.
  // Testing Library's own waits never time out on a fake setTimeout, so the page gets a short advance of
  // the fake clock to mount, then the tab is opened with vi.waitFor; the count starts after that.
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const { stream, calls } = renderLive(withMap);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(50);
  });
  const connection = await stream.connection();
  connection.event(ev(1, 'run.started', startedData));
  connection.event(planned(2, 'r1', 'Catalog'));
  connection.event(agentStarted(3, 'r1', 'Catalog'));
  await vi.waitFor(() => {
    fireEvent.click(tab('Activity'));
  });
  const reads = (): number =>
    calls.filter((call) => call.method === 'GET' && call.path === runPath).length;
  const before = reads();

  for (let n = 1; n <= 500; n += 1) {
    await act(async () => {
      connection.event(turn(3 + n, 'r1', n, [10, 1]));
      await vi.advanceTimersByTimeAsync(20);
    });
  }

  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  expect(tab('Activity').textContent).toContain('503');
  expect(reads() - before).toBeLessThanOrEqual(12);
});
