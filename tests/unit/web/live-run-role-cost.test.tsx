import { screen, waitFor, within } from '@testing-library/preact';
import { afterEach, expect, it, vi } from 'vitest';
import { agentStarted, ev, planned, startedData, turn } from './live-run-fixtures.js';
import { renderLive, runPath, runRow, valueOf } from './live-run-helpers.js';

// RF-1003, RF-424, P1-96: the live run page shows tokens and cost per role and per agent from the
// `usage.recorded` events of the run, keeps the total read from the run, and no longer says that
// the cost per role is missing. A local model's calls cost nothing: zero is shown, not a dash.

afterEach(() => {
  vi.unstubAllGlobals();
});

function usage(seq: number, agent: string, role: string, costMicros: number) {
  return ev(seq, 'usage.recorded', { callId: `c#${String(seq)}`, role, costMicros }, agent);
}

it('RF-1003 shows the cost of each role and each agent from the usage events, and the run total', async () => {
  const { stream } = renderLive({ [`GET ${runPath}`]: () => runRow({ costMicros: 4_100 }) });
  const connection = await stream.connection();

  connection.event(ev(1, 'run.started', startedData));
  connection.event(planned(2, 'reader-001', 'Catalog'));
  connection.event(planned(3, 'reader-002', 'Services'));
  connection.event(ev(4, 'agent.planned', { area: 'all', role: 'verifier', model: 'm' }, 'v-1'));
  connection.event(agentStarted(5, 'reader-001', 'Catalog'));
  connection.event(usage(6, 'reader-001', 'reader', 1_500));
  connection.event(turn(7, 'reader-001', 1, [900, 40]));
  connection.event(usage(8, 'reader-002', 'reader', 2_000));
  connection.event(usage(9, 'v-1', 'verifier', 600));

  const meter = await screen.findByRole('region', { name: 'Run meter' });
  await waitFor(() => {
    expect(within(meter).getByRole('row', { name: /verifier/u }).textContent).toContain('$0.0006');
  });
  expect(within(meter).getByRole('row', { name: /reader/u }).textContent).toContain('$0.0035');
  await waitFor(() => {
    expect(within(meter).getByRole('row', { name: /Total/u }).textContent).toContain('$0.0041');
  });
  expect(valueOf(screen.getByLabelText('Agent Catalog'), 'Cost')).toBe('$0.0015');
  expect(valueOf(screen.getByLabelText('Agent Services'), 'Cost')).toBe('$0.002');
  expect(meter.textContent).not.toContain('shows a dash');
});

it('RF-1003 calls of a local model show a cost of zero for the role and the agent', async () => {
  const { stream } = renderLive();
  const connection = await stream.connection();

  connection.event(ev(1, 'run.started', startedData));
  connection.event(planned(2, 'reader-001', 'Catalog'));
  connection.event(usage(3, 'reader-001', 'reader', 0));

  const meter = await screen.findByRole('region', { name: 'Run meter' });
  await waitFor(() => {
    expect(valueOf(screen.getByLabelText('Agent Catalog'), 'Cost')).toBe('$0.00');
  });
  expect(within(meter).getByRole('row', { name: /reader/u }).textContent).not.toContain('—');
});

it('RF-401 the usage of the Ollama check before the first task adds no agent panel', async () => {
  const { stream } = renderLive();
  const connection = await stream.connection();

  connection.event(ev(1, 'run.started', startedData));
  connection.event(usage(2, 'ollama-preflight', 'reader', 0));
  connection.event(planned(3, 'reader-001', 'Catalog'));

  expect(await screen.findByLabelText('Agent Catalog')).toBeTruthy();
  expect(screen.queryByLabelText('Agent ollama-preflight')).toBeNull();
  expect(screen.getAllByLabelText(/^Agent /u)).toHaveLength(1);
});
