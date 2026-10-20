import { render, screen } from '@testing-library/preact';
import { expect, it } from 'vitest';
import { estimateSchema } from '../../../web/src/api/estimate-schemas.js';
import { RunMeter } from '../../../web/src/pages/RunMeter.js';
import {
  agentStarted,
  deepenRoundEnded,
  deepenRoundStarted,
  deepenStarted,
  ev,
  planned,
  startedData,
  stateAfter,
} from './live-run-fixtures.js';
import { cloudEstimate, localEstimate } from './start-run-fixtures.js';

// RF-209, RF-425 (P3-62): the edges of the round of an agent and of the estimate line.

it('RF-209 keeps the round that planned an agent when it starts in a later round', () => {
  const state = stateAfter(
    deepenStarted(1),
    deepenRoundStarted(2, 1),
    planned(3, 'reader-001', 'Catalog'),
    deepenRoundEnded(4, 1),
    deepenRoundStarted(5, 2),
    agentStarted(6, 'reader-001', 'Catalog'),
  );

  expect(state.agents.map((agent) => agent.round)).toEqual([1]);
});

it('RF-209 gives an agent that starts without a plan the round that is on', () => {
  const state = stateAfter(deepenStarted(1), deepenRoundStarted(2, 1), agentStarted(3, 'r1', 'A'));

  expect(state.agents.map((agent) => agent.round)).toEqual([1]);
});

it('RF-209 gives no round to an agent before the first round of a Deepen has begun', () => {
  const state = stateAfter(deepenStarted(1), planned(2, 'reader-001', 'Catalog'));

  expect(state.agents.map((agent) => agent.round)).toEqual([undefined]);
});

const used = stateAfter(
  ev(1, 'run.started', startedData),
  ev(2, 'usage.recorded', { role: 'reader', tokens: { inputTokens: 1_000, outputTokens: 500 } }),
);

it('RF-425 says nothing about the estimate while a priced run has spent less than the likely cost', () => {
  render(
    <RunMeter state={used} costMicros={100_000} estimate={estimateSchema.parse(cloudEstimate)} />,
  );

  expect(screen.getByTestId('estimate-line')).toBeTruthy();
  expect(screen.queryByTestId('estimate-over')).toBeNull();
});

it('RF-425 says nothing about the estimate when it has no likely tokens and no likely cost', () => {
  const zero = { inputTokens: 0, outputTokens: 0, costMicros: '0' };
  const empty = estimateSchema.parse({
    ...localEstimate,
    total: { low: zero, likely: zero, high: zero },
  });

  render(<RunMeter state={used} costMicros={0} estimate={empty} />);

  expect(screen.getByTestId('estimate-line').textContent).toContain('Range 0 to 0 tokens.');
  expect(screen.queryByTestId('estimate-over')).toBeNull();
});
