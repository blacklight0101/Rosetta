import { expect, it } from 'vitest';
import type { Tile } from '../../../web/src/lib/live-run/code-map-tiles.js';
import { journeyOf, type JourneyStep } from '../../../web/src/lib/live-run/journey.js';
import type { RunPhase } from '../../../web/src/lib/live-run/run-phase.js';
import {
  agentEnded,
  agentStarted,
  cardProposed,
  citationChecked,
  ev,
  planned,
  startedData,
  stateAfter,
} from './live-run-fixtures.js';

// RF-1015 (P1-169): the run journey of the page while running: map the code, read, check citations,
// explain, your questions, with the current step.

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

const tiles = [tile('Catalog', 'done'), tile('Models', 'waiting'), tile('jQuery', 'library')];

const summary = (steps: readonly JourneyStep[]): readonly string[] =>
  steps.map((step) => `${step.title}:${step.status}`);

it('RF-1015 has the five steps in order and the questions come last', () => {
  const state = stateAfter(ev(1, 'run.started', startedData));

  const steps = journeyOf({ stage: 'understand', phase: running, state, tiles });

  expect(steps.map((step) => step.title)).toEqual([
    'Map the code',
    'Read',
    'Check citations',
    'Explain',
    'Your questions',
  ]);
});

it('RF-1015 has the map done, reading current and the rest later while the agents read', () => {
  const state = stateAfter(
    ev(1, 'run.started', startedData),
    planned(2, 'r1', 'Catalog'),
    planned(3, 'r2', 'Models'),
    agentStarted(4, 'r1', 'Catalog'),
    cardProposed(5, 'r1', 'BR-001', 2),
    citationChecked(6, 'r1', 'BR-001.c1', true),
    agentEnded(7, 'r1', 'Done', 1),
  );

  const steps = journeyOf({ stage: 'understand', phase: running, state, tiles });

  expect(summary(steps)).toEqual([
    'Map the code:done',
    'Read:current',
    'Check citations:later',
    'Explain:later',
    'Your questions:later',
  ]);
  expect(steps[0]?.detail).toBe('2 areas, 1 library folder left out');
  expect(steps[1]?.detail).toBe('1 of 2 areas');
  expect(steps[2]?.detail).toBe('1 of 2 citations checked');
});

it('RF-1015 moves to checking the citations when every agent has ended', () => {
  const state = stateAfter(
    ev(1, 'run.started', startedData),
    planned(2, 'r1', 'Catalog'),
    agentStarted(3, 'r1', 'Catalog'),
    cardProposed(4, 'r1', 'BR-001', 2),
    citationChecked(5, 'r1', 'BR-001.c1', true),
    agentEnded(6, 'r1', 'Done', 1),
  );

  const steps = journeyOf({ stage: 'understand', phase: running, state, tiles });

  expect(summary(steps).slice(0, 3)).toEqual([
    'Map the code:done',
    'Read:done',
    'Check citations:current',
  ]);
  expect(steps[1]?.detail).toBe('1 of 1 areas');
});

it('RF-1015 says the planning is under way before any agent exists', () => {
  const state = stateAfter(ev(1, 'run.started', startedData));

  const steps = journeyOf({ stage: 'understand', phase: running, state, tiles });

  expect(steps[1]).toMatchObject({ status: 'current', detail: 'planning the areas' });
});

it('RF-1015 keeps every step waiting while the run is queued', () => {
  const steps = journeyOf({
    stage: 'understand',
    phase: { kind: 'queued' },
    state: stateAfter(),
    tiles: [],
  });

  expect(steps.every((step) => step.status === 'later')).toBe(true);
  expect(steps[0]?.detail).toBe('waiting in the queue');
});

it('RF-1015 is on the map while the scan works and leaves the other steps later', () => {
  const state = stateAfter(ev(1, 'run.started', { ...startedData, stage: 'scan' }));

  const steps = journeyOf({ stage: 'scan', phase: running, state, tiles: [] });

  expect(summary(steps)).toEqual([
    'Map the code:current',
    'Read:later',
    'Check citations:later',
    'Explain:later',
    'Your questions:later',
  ]);
});

it('RF-1015 has the map done with its files and areas once the scan completed', () => {
  const state = stateAfter(
    ev(1, 'run.started', { ...startedData, stage: 'scan' }),
    ev(2, 'scan.completed', { files: 120, areas: 7 }),
  );

  const steps = journeyOf({ stage: 'scan', phase: running, state, tiles: [] });

  expect(steps[0]).toMatchObject({ status: 'done', detail: '120 files, 7 areas' });
  expect(steps[1]).toMatchObject({ status: 'later', detail: 'in an Understand run' });
});
