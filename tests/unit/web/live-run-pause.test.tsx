import { act, fireEvent, screen, waitFor, within } from '@testing-library/preact';
import { afterEach, expect, it, vi } from 'vitest';
import {
  agentEnded,
  agentStarted,
  ev,
  planned,
  runEnded,
  startedData,
  turn,
} from './live-run-fixtures.js';
import { findAgentPanel, renderLive, runPath, valueOf } from './live-run-helpers.js';
import { openTab, openTabWhenReady } from './live-run-running-helpers.js';

// RF-1002, design-system.md section 1 (principle 6) and section 4 (Pause updates) (P1-95): the live
// run page can freeze its agent panels, overview and event log for reading while the stream keeps
// filling a buffer; a counter shows how many events wait; Resume applies them in order.

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// web/src/pages/use-pause-updates.ts: how long `Updates resumed` stays in the status.
const RESUMED_NOTE_MS = 3000;

const count = (): string => screen.getByTestId('pause-count').textContent;
const logItems = (): HTMLElement[] =>
  within(screen.getByRole('log', { name: 'Event log' })).getAllByRole('listitem');

/** A run with one agent that is working: `run.started`, `agent.planned`, `agent.started`, one turn. */
async function runningRun() {
  const live = renderLive();
  const connection = await live.stream.connection();
  await openTabWhenReady('All agents');
  connection.event(ev(1, 'run.started', startedData));
  connection.event(planned(2, 'reader-001', 'Catalog'));
  connection.event(agentStarted(3, 'reader-001', 'Catalog'));
  connection.event(turn(4, 'reader-001', 1, [900, 40]));
  const panel = await findAgentPanel('Catalog');
  await waitFor(() => {
    expect(valueOf(panel, 'Tokens')).toBe('940');
  });
  return { ...live, connection, panel };
}

it('RF-1002 offers Pause updates while the run works and no button when it has ended', async () => {
  const { connection } = await runningRun();

  expect(screen.getByRole('button', { name: 'Pause updates' })).toBeTruthy();
  connection.event(runEnded(5, 'Completed'));

  await waitFor(() => {
    expect(screen.queryByRole('button', { name: 'Pause updates' })).toBeNull();
  });
});

it('RF-1002 Pause updates holds the panels, the overview and the log while the counter counts the events that wait', async () => {
  const { connection, panel } = await runningRun();
  fireEvent.click(screen.getByRole('button', { name: 'Pause updates' }));

  connection.event(turn(5, 'reader-001', 2, [100, 10]));
  connection.event(agentEnded(6, 'reader-001', 'Done', 0));

  await waitFor(() => {
    expect(count()).toContain('2 events waiting');
  });
  expect(valueOf(panel, 'Tokens')).toBe('940');
  expect(panel.textContent).toContain('Running');
  expect(valueOf(screen.getByRole('region', { name: 'Overview' }), 'Done')).toBe('0');
  openTab('Activity');
  expect(logItems()).toHaveLength(4);
  connection.event(turn(7, 'reader-001', 3, [1, 1]));
  await waitFor(() => {
    expect(count()).toContain('3 events waiting');
  });
  expect(screen.getByRole('button', { name: 'Resume' })).toBeTruthy();
});

it('RF-1002 Resume applies the held events in order and the button reads Pause updates again', async () => {
  const { connection, panel } = await runningRun();
  fireEvent.click(screen.getByRole('button', { name: 'Pause updates' }));
  connection.event(turn(5, 'reader-001', 2, [100, 10]));
  connection.event(agentEnded(6, 'reader-001', 'Done', 0));
  await waitFor(() => {
    expect(count()).toContain('2 events waiting');
  });

  fireEvent.click(screen.getByRole('button', { name: 'Resume' }));

  await waitFor(() => {
    expect(valueOf(panel, 'Tokens')).toBe('1,050');
  });
  expect(panel.textContent).toContain('Done');
  openTab('Activity');
  const types = logItems().map((item) => item.textContent);
  expect(types[0]).toContain('agent.ended');
  expect(types[1]).toContain('agent.turn');
  expect(types).toHaveLength(6);
  expect(screen.queryByTestId('pause-count')).toBeNull();
  expect(screen.getByRole('button', { name: 'Pause updates' })).toBeTruthy();
});

it('RF-1002 the page status says that updates are paused and resumed, and does not announce the counter', async () => {
  const { connection } = await runningRun();
  const status = screen.getByTestId('run-status');

  fireEvent.click(screen.getByRole('button', { name: 'Pause updates' }));
  connection.event(turn(5, 'reader-001', 2, [100, 10]));

  await waitFor(() => {
    expect(status.textContent).toContain('Updates paused');
  });
  await waitFor(() => {
    expect(count()).toContain('1 event waiting');
  });
  expect(status.textContent).not.toContain('waiting');
  expect(screen.getAllByRole('status')).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
  await waitFor(() => {
    expect(status.textContent).toContain('Updates resumed');
  });
  expect(status.textContent).not.toContain('Updates paused');
});

it('RF-1003 Stop run stays usable while updates are paused', async () => {
  const { connection, calls } = await runningRun();
  fireEvent.click(screen.getByRole('button', { name: 'Pause updates' }));
  connection.event(turn(5, 'reader-001', 2, [100, 10]));
  await waitFor(() => {
    expect(count()).toContain('1 event waiting');
  });

  fireEvent.click(screen.getByRole('button', { name: 'Stop run' }));

  await waitFor(() => {
    expect(calls.at(-1)).toMatchObject({ method: 'POST', path: `${runPath}/stop` });
  });
});

it('RF-1002 when the run ends while paused, the status shows how it ended and the panels stay held until Resume', async () => {
  const { connection } = await runningRun();
  fireEvent.click(screen.getByRole('button', { name: 'Pause updates' }));

  connection.event(agentEnded(5, 'reader-001', 'Done', 0));
  connection.event(runEnded(6, 'Completed'));

  await waitFor(() => {
    expect(screen.getByTestId('run-status').textContent).toContain('Completed');
  });
  expect((await findAgentPanel('Catalog')).textContent).toContain('Running');
  expect(screen.queryByRole('button', { name: 'Pause updates' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
  await waitFor(() => {
    expect(screen.getByLabelText('Agent Catalog').textContent).toContain('Done');
  });
});

it('RF-1002 the journey is held with the panels, so it never disagrees with them', async () => {
  const { connection } = await runningRun();
  const pipeline = screen.getByTestId('journey');
  expect(pipeline.textContent).not.toContain('citations checked');
  fireEvent.click(screen.getByRole('button', { name: 'Pause updates' }));

  connection.event(
    ev(
      5,
      'agent.card.proposed',
      { cardId: 'BR-001', type: 'BR', title: 'T', claims: 2 },
      'reader-001',
    ),
  );
  await waitFor(() => {
    expect(count()).toContain('1 event waiting');
  });
  expect(pipeline.textContent).not.toContain('citations checked');
  fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
  await waitFor(() => {
    expect(pipeline.textContent).toContain('0 of 2 citations checked');
    expect(pipeline.textContent).toContain('Judgement comes in a later version');
  });
});

it('RF-1002 Updates resumed leaves the status after it was announced', async () => {
  await runningRun();
  const status = screen.getByTestId('run-status');
  // Only the timers are faked, and only once the stream is connected, so the page loads in real time.
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  fireEvent.click(screen.getByRole('button', { name: 'Pause updates' }));
  fireEvent.click(screen.getByRole('button', { name: 'Resume' }));
  expect(status.textContent).toContain('Updates resumed');

  await act(() => {
    vi.advanceTimersByTime(RESUMED_NOTE_MS - 1);
  });
  expect(status.textContent).toContain('Updates resumed');
  await act(() => {
    vi.advanceTimersByTime(1);
  });

  expect(status.textContent).not.toContain('Updates resumed');
});
