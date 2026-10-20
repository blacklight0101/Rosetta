import { cleanup, render } from '@testing-library/preact';
import { afterEach, expect, it } from 'vitest';
import type { Tile } from '../../../web/src/lib/live-run/code-map-tiles.js';
import { journeyOf } from '../../../web/src/lib/live-run/journey.js';
import type { RunPhase } from '../../../web/src/lib/live-run/run-phase.js';
import { RunOverview } from '../../../web/src/pages/RunOverview.js';
import {
  agentEnded,
  agentStarted,
  cardProposed,
  citationChecked,
  ev,
  planned,
  runEnded,
  startedData,
  stateAfter,
} from './live-run-fixtures.js';

// RF-1015, RF-1014 (P3-61): the steps of the run journey count on one basis, and the claims tile
// and the journey say "citations checked" for the same thing.

afterEach(cleanup);

const running: RunPhase = { kind: 'running' };

const tile = (name: string, state: Tile['state']): Tile => ({
  name,
  state,
  tokens: 1,
  filesRead: 0,
  cards: 0,
  agentTaskId: undefined,
  columns: 2,
  rows: 1,
  progress: undefined,
});

const threeAreas = [tile('Catalog', 'done'), tile('Models', 'done'), tile('Services', 'gap')];

it('RF-1015 counts the areas read, not the agents, in a run whose areas were read again', () => {
  // A Deepen: Catalog is read by three agents (rounds 1 and 2), Models by two, Services by none.
  const state = stateAfter(
    ev(1, 'run.started', startedData),
    ...['r1', 'r2', 'r3'].flatMap((id, index) => [
      planned(2 + index, id, 'Catalog'),
      agentStarted(5 + index, id, 'Catalog'),
      agentEnded(8 + index, id, 'Done', 0),
    ]),
    ...['r4', 'r5'].flatMap((id, index) => [
      planned(11 + index, id, 'Models'),
      agentStarted(13 + index, id, 'Models'),
      agentEnded(15 + index, id, 'Done', 0),
    ]),
  );

  const steps = journeyOf({ stage: 'understand', phase: running, state, tiles: threeAreas });

  expect(steps[0]?.detail).toBe('3 areas');
  expect(steps[1]?.detail).toBe('2 of 3 areas');
});

it('RF-1015 does not count an area as read while one of its agents still works', () => {
  const state = stateAfter(
    ev(1, 'run.started', startedData),
    planned(2, 'r1', 'Catalog'),
    agentStarted(3, 'r1', 'Catalog'),
    agentEnded(4, 'r1', 'Done', 0),
    planned(5, 'r2', 'Catalog'),
    agentStarted(6, 'r2', 'Catalog'),
    planned(7, 'r3', 'Models'),
    agentStarted(8, 'r3', 'Models'),
    agentEnded(9, 'r3', 'Done', 0),
  );

  const steps = journeyOf({ stage: 'understand', phase: running, state, tiles: threeAreas });

  expect(steps[1]).toMatchObject({ status: 'current', detail: '1 of 3 areas' });
});

const checkedClaims = [
  ev(1, 'run.started', startedData),
  cardProposed(2, 'reader-001', 'BR-001', 2),
  citationChecked(3, 'reader-001', 'BR-001.c1', true),
  citationChecked(4, 'reader-001', 'BR-001.c2', true),
];

it('RF-1014 the claims tile calls claims that wait for the verifier waiting, as the journey does', () => {
  const state = stateAfter(...checkedClaims);

  const { container } = render(<RunOverview state={state} />);
  const journey = journeyOf({ stage: 'understand', phase: running, state, tiles: [] });

  expect(container.textContent).toContain('2 waiting for judgement');
  expect(container.textContent).not.toContain('citations checked');
  expect(journey[2]?.detail).toBe('2 of 2 citations checked, 2 waiting for judgement');
});

it('RF-1014 the claims tile says not judged for claims a stopped run left, as the journey does', () => {
  const state = stateAfter(...checkedClaims, runEnded(5, 'Interrupted'));

  const { container } = render(<RunOverview state={state} />);

  expect(container.textContent).toContain('2 not judged');
  expect(container.textContent).not.toContain('citations checked');
});
