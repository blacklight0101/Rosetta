import { fireEvent, screen, waitFor } from '@testing-library/preact';
import { afterEach, expect, it, vi } from 'vitest';
import { failure } from './fake-api.js';
import {
  agentEnded,
  agentStarted,
  ev,
  planned,
  runEnded,
  startedData,
  turn,
} from './live-run-fixtures.js';
import { openTabWhenReady } from './live-run-running-helpers.js';
import { findAgentPanel, renderLive, runPath, valueOf } from './live-run-helpers.js';

// RF-1002..RF-1006, RF-1108, RF-008, RF-507, DEC-103 (P1-35): a live run page that loses its connection or its run. Whatever the page shows comes from
// the events the test pushes into the fake stream.

afterEach(() => {
  vi.unstubAllGlobals();
});

const retry = 'retry: 5\n\n';

it('RF-1006 reconnects after a break with the last event id and shows each event once', async () => {
  const { stream } = renderLive();
  const first = await stream.connection(0);
  await openTabWhenReady('All agents');
  first.raw(retry);
  first.event(ev(1, 'run.started', startedData));
  first.event(planned(2, 'reader-001', 'Catalog'));
  first.event(turn(3, 'reader-001', 1, [900, 40]));
  const panel = await findAgentPanel('Catalog');
  await waitFor(() => {
    expect(valueOf(panel, 'Tokens')).toBe('940');
  });

  first.end();

  expect((await screen.findByTestId('connection')).textContent).toContain('Reconnecting');
  const second = await stream.connection(1);
  expect(stream.requests[1]?.lastEventId).toBe('3');
  second.event(turn(3, 'reader-001', 1, [900, 40]));
  second.event(turn(4, 'reader-001', 2, [100, 10]));
  await waitFor(() => {
    expect(valueOf(panel, 'Tokens')).toBe('1,050');
  });
  expect(valueOf(panel, 'Turns')).toBe('2');
  await waitFor(() => {
    expect(screen.queryByTestId('connection')).toBeNull();
  });
});

it('RF-1006 a page opened on a run that is under way replays the stored events', async () => {
  const { stream } = renderLive();
  const connection = await stream.connection();

  connection.event(ev(1, 'run.started', startedData));
  connection.event(planned(2, 'reader-001', 'Catalog'));
  connection.event(agentStarted(3, 'reader-001', 'Catalog'));
  connection.event(agentEnded(4, 'reader-001', 'Done'));
  connection.event(runEnded(5, 'Completed'));

  // The ended run has its agents in the Evidence tab.
  fireEvent.click(await screen.findByRole('tab', { name: /^Evidence/u }));
  expect((await findAgentPanel('Catalog')).textContent).toContain('Done');
  await waitFor(() => {
    expect(screen.getByTestId('run-status').textContent).toContain('Completed');
  });
});

it('RF-1105 a run that is not the user own shows the error and opens no stream', async () => {
  const { stream } = renderLive({ [`GET ${runPath}`]: failure(404, 'RST-2003') });

  const banner = await screen.findByTestId('error-banner');

  expect(banner.textContent).toContain('RST-2003');
  expect(stream.requests).toHaveLength(0);
});

it('RF-1105 a stream the server refuses shows the error of the run', async () => {
  const { stream } = renderLive();
  stream.answerNext({ status: 404 });

  const banner = await screen.findByTestId('error-banner');

  expect(banner.textContent).toContain('RST-2003');
});
