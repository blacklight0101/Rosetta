import { screen } from '@testing-library/preact';
import { afterEach, expect, it, vi } from 'vitest';
import type { RunMeterReading } from '../../../web/src/app/run-meter-signal.js';
import { RunMeterContext } from '../../../web/src/app/run-meter-signal.js';
import { LiveRunPage } from '../../../web/src/pages/LiveRunPage.js';
import { renderPage } from './fake-api.js';
import { ev, runEnded, startedData } from './live-run-fixtures.js';
import { runPath, runRow, runUuid } from './live-run-helpers.js';
import { StreamServer } from './stream-server.js';

// RF-1003, RF-1015 (P8-27, UX-11): a finished scan run has no meter: the page publishes no reading
// to the header, so "Run meter $0.00 of $0.50" never shows on it.

afterEach(() => {
  vi.unstubAllGlobals();
});

it('RF-1003 a finished scan run publishes no run meter reading and shows none', async () => {
  const publish = vi.fn<(reading: RunMeterReading | undefined) => void>();
  const stream = new StreamServer();
  vi.stubGlobal('fetch', stream.send);
  renderPage(
    <RunMeterContext.Provider value={publish}>
      <LiveRunPage />
    </RunMeterContext.Provider>,
    { [`GET ${runPath}`]: runRow({ stage: 'scan', queueState: 'Ended', endState: 'Completed' }) },
    undefined,
    { runId: runUuid },
  );
  const connection = await stream.connection();
  connection.event(ev(1, 'run.started', { ...startedData, stage: 'scan' }));
  connection.event(runEnded(2, 'Completed'));

  await screen.findByRole('heading', { level: 1, name: 'Scan, done' });
  expect(publish.mock.calls.every(([reading]) => reading === undefined)).toBe(true);
  expect(screen.queryByText(/run meter/iu)).toBeNull();
});
