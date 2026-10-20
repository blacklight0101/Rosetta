import { screen, waitFor } from '@testing-library/preact';
import { afterEach, expect, it, vi } from 'vitest';
import { ev, runEnded, startedData } from './live-run-fixtures.js';
import { renderLive, runPath, runRow } from './live-run-helpers.js';
import { codeMapAnswer, codeMapPath, ownAreas, tab } from './live-run-running-helpers.js';

// RF-1002, RF-1015 (P3-62, owner test 2026-10-20): the Activity tab of the page of a run counts the
// events it holds; the log keeps the newest 1,000, so a longer run shows "1,000+", not "1000".

afterEach(() => {
  vi.unstubAllGlobals();
});

const withMap = { [`GET ${codeMapPath}`]: codeMapAnswer(ownAreas) };

it('RF-1002 shows the number of events on the Activity tab while the log holds them all', async () => {
  const { stream } = renderLive(withMap);
  const connection = await stream.connection();

  connection.event(ev(1, 'run.started', startedData));
  for (let seq = 2; seq <= 40; seq += 1) connection.event(ev(seq, 'scan.completed', {}));

  await waitFor(() => {
    expect(tab('Activity').textContent).toBe('Activity40');
  });
});

it('RF-1002 shows "1,000+" on the Activity tab for a run of more than 1,000 events', async () => {
  const { stream } = renderLive(withMap);
  const connection = await stream.connection();

  connection.event(ev(1, 'run.started', startedData));
  for (let seq = 2; seq <= 1_100; seq += 1) connection.event(ev(seq, 'scan.completed', {}));

  await waitFor(
    () => {
      expect(tab('Activity').textContent).toBe('Activity1,000+');
    },
    { timeout: 5_000 },
  );
  expect(screen.getByRole('tab', { name: /^Activity/u }).textContent).not.toContain('1000');
});

it('RF-1002 shows "1,000+" on the Activity tab of an ended run with a full log', async () => {
  const { stream } = renderLive({
    ...withMap,
    [`GET ${runPath}`]: runRow({ queueState: 'Ended', endState: 'Completed' }),
  });
  const connection = await stream.connection();

  connection.event(ev(1, 'run.started', startedData));
  for (let seq = 2; seq <= 1_100; seq += 1) connection.event(ev(seq, 'scan.completed', {}));
  connection.event(runEnded(1_101, 'Completed'));

  await waitFor(
    () => {
      expect(tab('Activity').textContent).toBe('Activity1,000+');
    },
    { timeout: 5_000 },
  );
});
