import { screen, waitFor, within } from '@testing-library/preact';
import { afterEach, expect, it, vi } from 'vitest';
import { json } from './fake-api.js';
import { agentStarted, ev, planned, startedData } from './live-run-fixtures.js';
import { renderLive, runPath, runRow } from './live-run-helpers.js';
import { codeMapAnswer, codeMapPath, openTab, ownAreas } from './live-run-running-helpers.js';
import { facts } from './journey-fixtures.js';

// RF-1003, RF-424, RF-434, P8-24 (UX-21, UX-27, EV-85): the page of a run of a journey approved at $4.00
// shows the approved amount left and not the project run cap of $0.50, in the spend panel and in the
// run meter; the header meter reads the same amount from the same page.

afterEach(() => {
  vi.unstubAllGlobals();
});

const started = {
  ...startedData,
  roles: { reader: { provider: 'anthropic', kind: 'anthropic', model: 'haiku' } },
  caps: { run: { maxCostMicros: 500_000, maxTokens: 2_000_000 } },
};
const journey = facts({
  budget: {
    approvedMicros: 4_000_000,
    remainingMicros: 3_962_940,
    approvedTokens: 4_000_000,
    remainingTokens: 3_900_000,
  },
});

async function openJourneyRun(budget: typeof journey) {
  const { stream } = renderLive({
    [`GET ${codeMapPath}`]: codeMapAnswer(ownAreas),
    [`GET ${runPath}`]: runRow({ costMicros: 37_060 }),
    'GET /api/projects/p-1/journey': json(200, budget),
  });
  const connection = await stream.connection();
  for (const event of [
    ev(1, 'run.started', started),
    planned(2, 'r1', 'Catalog'),
    agentStarted(3, 'r1', 'Catalog'),
  ]) {
    connection.event(event);
  }
  return screen.findByRole('region', { name: 'Spend for this run' });
}

it('RF-1003 RF-434 P8-24 the spend panel and the run meter of a journey run show the approved amount left and no cap of $0.50', async () => {
  const spend = await openJourneyRun(journey);

  await waitFor(() => {
    expect(spend.textContent).toContain('$3.96 left of $4.00 approved');
  });
  expect(spend.textContent).not.toContain('$0.50');
  expect(spend.textContent).not.toContain('2,000,000');
  const panel = openTab('All agents');
  const meter = within(panel).getByRole('region', { name: 'Run meter' });
  expect(meter.textContent).toContain('$3.96 left of $4.00 approved');
  expect(meter.textContent).not.toContain('$0.50');
});

it('RF-1003 a run outside a journey keeps the cap of the run', async () => {
  const spend = await openJourneyRun({ ...journey, budget: null });

  await waitFor(() => {
    expect(spend.textContent).toContain('cap $0.50');
  });
  expect(spend.textContent).not.toContain('approved');
});
