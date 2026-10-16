import { screen, waitFor } from '@testing-library/preact';
import { afterEach, expect, it, vi } from 'vitest';
import { UsageSignalContext } from '../../../web/src/app/usage-signal.js';
import { LiveRunPage } from '../../../web/src/pages/LiveRunPage.js';
import { renderPage } from './fake-api.js';
import { agentStarted, ev, planned, startedData, turn } from './live-run-fixtures.js';
import { runPath, runRow, runUuid } from './live-run-helpers.js';
import { openTabWhenReady } from './live-run-running-helpers.js';
import { StreamServer } from './stream-server.js';

// RF-1010, P1-36: the live run page tells the signed-in shell each time a model call completes, so
// the totals pill in the header reads the ledger again during the run.

afterEach(() => {
  vi.unstubAllGlobals();
});

it('RF-1010 the live run page announces each completed model turn to the header totals', async () => {
  const stream = new StreamServer();
  vi.stubGlobal('fetch', stream.send);
  const announce = vi.fn<() => void>();
  renderPage(
    <UsageSignalContext.Provider value={announce}>
      <LiveRunPage />
    </UsageSignalContext.Provider>,
    { [`GET ${runPath}`]: runRow() },
    undefined,
    { runId: runUuid },
  );
  const connection = await stream.connection();
  await openTabWhenReady('All agents');

  connection.event(ev(1, 'run.started', startedData));
  connection.event(planned(2, 'reader-001', 'Catalog'));
  connection.event(agentStarted(3, 'reader-001', 'Catalog'));
  expect(await screen.findByLabelText('Agent Catalog')).not.toBeNull();
  expect(announce).not.toHaveBeenCalled();

  connection.event(turn(4, 'reader-001', 1, [900, 40]));
  await waitFor(() => {
    expect(announce).toHaveBeenCalledTimes(1);
  });
  connection.event(turn(5, 'reader-001', 2, [400, 20]));
  await waitFor(() => {
    expect(announce).toHaveBeenCalledTimes(2);
  });
});
