import { expect, it } from 'vitest';
import { phaseOf, type RunPhase } from '../../../web/src/lib/live-run/run-phase.js';
import type { RunRow } from '../../../web/src/api/run-schemas.js';
import type { RunEvent } from '../../../web/src/api/run-events.js';
import { stepperOf } from '../../../web/src/lib/live-run/run-stepper.js';
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

// RF-1002, RF-1003, RF-1004, design-system.md section 5 (pipeline stepper): the five steps of a run
// as the page can tell them from the events and the run row. A stage the run does not include stays
// waiting; at most one step is current.

const sha = '3f786850e387550fdab836ed7e6dc881de23001b';

function row(stage: string, queueState: RunRow['queueState'] = 'Running'): RunRow {
  return {
    id: 'run-1',
    projectId: 'p-1',
    runId: 'r',
    stage,
    queueState,
    endState: null,
    commitSha: null,
    totals: { costMicros: 0, inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 },
  };
}

type Events = readonly RunEvent[];

/** The steps as `name:status` words, so a case reads as one line. */
function words(stage: string, events: Events, phase?: RunPhase): string[] {
  const state = stateAfter(...events);
  const runRow = row(stage);
  const steps = stepperOf(runRow, state, phase ?? phaseOf(runRow, state));
  return steps.map((step) => `${step.name}:${step.status}`);
}

/** A scan has pinned no commit when it starts; an understand run starts on the commit of its scan. */
const started = (stage: string): RunEvent =>
  ev(1, 'run.started', {
    ...startedData,
    stage,
    source: { ...startedData.source, commitSha: stage === 'scan' ? null : sha },
  });
const resolved = ev(2, 'source.resolved', {
  url: 'https://github.com/octo/demo',
  ref: 'main',
  commitSha: sha,
});
const scanned = ev(4, 'scan.completed', {
  files: 36,
  areas: 4,
  mapLevels: { coarse: 30, symbols: 6 },
});

it('RF-1002 lists Snapshot, Scan, Understand, Verify and Report in that order', () => {
  const steps = stepperOf(row('understand'), stateAfter(), { kind: 'queued' });

  expect(steps.map((step) => step.name)).toEqual([
    'Snapshot',
    'Scan',
    'Understand',
    'Verify',
    'Report',
  ]);
});

it('RF-1002 a queued run has every step waiting', () => {
  expect(words('understand', [], { kind: 'queued' })).toEqual([
    'Snapshot:waiting',
    'Scan:waiting',
    'Understand:waiting',
    'Verify:waiting',
    'Report:waiting',
  ]);
});

it('RF-1002 a scan that has started works on the snapshot, then on the scan', () => {
  expect(words('scan', [started('scan')])).toEqual([
    'Snapshot:current',
    'Scan:waiting',
    'Understand:waiting',
    'Verify:waiting',
    'Report:waiting',
  ]);
  expect(words('scan', [started('scan'), resolved])).toEqual([
    'Snapshot:done',
    'Scan:current',
    'Understand:waiting',
    'Verify:waiting',
    'Report:waiting',
  ]);
});

it('RF-1002 a finished scan shows its files and areas and leaves the other stages waiting', () => {
  const events = [started('scan'), resolved, scanned, runEnded(5, 'Completed')];
  const state = stateAfter(...events);
  const runRow = row('scan', 'Ended');

  const steps = stepperOf(runRow, state, phaseOf(runRow, state));

  expect(steps.map((step) => `${step.name}:${step.status}`)).toEqual([
    'Snapshot:done',
    'Scan:done',
    'Understand:waiting',
    'Verify:waiting',
    'Report:waiting',
  ]);
  expect(steps[1]?.detail).toBe('36 files, 4 areas');
});

it('RF-1002 an understand run starts on a scan that is already done and works on Understand', () => {
  expect(words('understand', [started('understand')])).toEqual([
    'Snapshot:done',
    'Scan:done',
    'Understand:current',
    'Verify:waiting',
    'Report:waiting',
  ]);
});

it('RF-1002 RF-1004 Understand counts the agents done of the agents planned and Verify the claims checked of the claims proposed', () => {
  const events = [
    started('understand'),
    planned(2, 'a1', 'Catalog'),
    planned(3, 'a2', 'Services'),
    planned(4, 'a3', 'Models'),
    agentStarted(5, 'a1', 'Catalog'),
    cardProposed(6, 'a1', 'BR-001', 3),
    citationChecked(7, 'a1', 'BR-001.c1', true),
    citationChecked(8, 'a1', 'BR-001.c2', 'The file does not exist.'),
    agentEnded(9, 'a1', 'Done', 1),
  ];
  const state = stateAfter(...events);
  const runRow = row('understand');

  const steps = stepperOf(runRow, state, phaseOf(runRow, state));

  expect(steps.map((step) => `${step.name}:${step.status}`)).toEqual([
    'Snapshot:done',
    'Scan:done',
    'Understand:current',
    'Verify:waiting',
    'Report:waiting',
  ]);
  expect(steps[2]?.detail).toBe('1 of 3 agents done');
  expect(steps[3]?.detail).toBe('2 of 3 claims checked');
});

it('RF-1002 Verify becomes the current step once every agent has ended', () => {
  const events = [
    started('understand'),
    planned(2, 'a1', 'Catalog'),
    cardProposed(3, 'a1', 'BR-001', 2),
    citationChecked(4, 'a1', 'BR-001.c1', true),
    agentEnded(5, 'a1', 'Done', 1),
  ];
  const state = stateAfter(...events);
  const runRow = row('understand');

  const steps = stepperOf(runRow, state, phaseOf(runRow, state));

  expect(steps.map((step) => `${step.name}:${step.status}`)).toEqual([
    'Snapshot:done',
    'Scan:done',
    'Understand:done',
    'Verify:current',
    'Report:waiting',
  ]);
  expect(steps[2]?.detail).toBe('1 of 1 agents done');
  expect(steps[3]?.detail).toBe('1 of 2 claims checked');
});

it('RF-1002 a completed understand run has every step done but the report, which the run does not build', () => {
  const events = [
    started('understand'),
    planned(2, 'a1', 'Catalog'),
    cardProposed(3, 'a1', 'BR-001', 1),
    citationChecked(4, 'a1', 'BR-001.c1', true),
    agentEnded(5, 'a1', 'Done', 1),
    runEnded(6, 'Completed'),
  ];

  expect(words('understand', events)).toEqual([
    'Snapshot:done',
    'Scan:done',
    'Understand:done',
    'Verify:done',
    'Report:waiting',
  ]);
});

it('RF-1002 a run that was stopped has no current step and keeps the steps it never reached waiting', () => {
  const events = [
    started('understand'),
    planned(2, 'a1', 'Catalog'),
    planned(3, 'a2', 'Services'),
    agentEnded(4, 'a1', 'Done'),
    runEnded(5, 'Interrupted'),
  ];
  const state = stateAfter(...events);
  const runRow = row('understand', 'Ended');

  const steps = stepperOf(runRow, state, phaseOf(runRow, state));

  expect(steps.filter((step) => step.status === 'current')).toEqual([]);
  expect(steps.map((step) => `${step.name}:${step.status}`)).toEqual([
    'Snapshot:done',
    'Scan:done',
    'Understand:waiting',
    'Verify:waiting',
    'Report:waiting',
  ]);
  expect(steps[2]?.detail).toBe('1 of 2 agents done');
});

it('RF-1002 the state keeps the files and areas of scan.completed and ignores a malformed one', () => {
  expect(stateAfter(scanned).scan).toEqual({ files: 36, areas: 4 });
  expect(stateAfter(ev(1, 'scan.completed', { files: 'many' })).scan).toBeUndefined();
});
