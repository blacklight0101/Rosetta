import { expect, it } from 'vitest';
import type { RunEvent } from '../../../web/src/api/run-events.js';
import type { RunRow } from '../../../web/src/api/run-schemas.js';
import { journeyOf } from '../../../web/src/lib/live-run/journey.js';
import { phaseOf } from '../../../web/src/lib/live-run/run-phase.js';
import { stepperOf } from '../../../web/src/lib/live-run/run-stepper.js';
import {
  agentEnded,
  cardProposed,
  citationChecked,
  ev,
  planned,
  runEnded,
  startedData,
  stateAfter,
} from './live-run-fixtures.js';

// RF-1014, DEC-136, RF-301 (P2-02): the judgement step is built, so nothing says it comes in a later
// version. A claim that passed its citation check is "waiting for judgement" only while the step is
// queued or running; once it ends the claim shows its verdict, and a claim the run left unjudged says
// so.

function row(queueState: RunRow['queueState'] = 'Running'): RunRow {
  return {
    ...{ id: 'run-1', projectId: 'p-1', runId: 'r', stage: 'understand', queueState },
    ...{ endState: null, commitSha: null, startedAt: null, position: null },
    totals: { costMicros: 0, inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 },
    ...{ reportBuilt: false, failedAreas: 0 },
  };
}

const read = [
  ev(1, 'run.started', startedData),
  planned(2, 'a1', 'Catalog'),
  cardProposed(3, 'a1', 'BR-001', 3),
  citationChecked(4, 'a1', 'BR-001.c1', true),
  citationChecked(5, 'a1', 'BR-001.c2', true),
  citationChecked(6, 'a1', 'BR-001.c3', 'The file does not exist.'),
  agentEnded(7, 'a1', 'Done', 1),
];

const judged = (seq: number, claimId: string, status: string): RunEvent =>
  ev(seq, 'verify.claim.judged', { claimId, status, reason: `${status} by the lines.` });

const judgement = [
  ...read,
  ev(8, 'verify.judgement.started', { claims: 2 }),
  judged(9, 'BR-001.c1', 'Supported'),
  judged(10, 'BR-001.c2', 'Rejected'),
  ev(11, 'verify.judgement.ended', { supported: 1, rejected: 1, unverified: 0, notJudged: 0 }),
];

function verifyStep(events: readonly RunEvent[], runRow = row()) {
  const state = stateAfter(...events);
  return stepperOf(runRow, state, phaseOf(runRow, state))[3];
}

function checkStep(events: readonly RunEvent[]) {
  const state = stateAfter(...events);
  const steps = journeyOf({ stage: 'understand', phase: { kind: 'running' }, state, tiles: [] });
  return steps[2];
}

it('RF-1014 the stepper says the claims that passed wait for judgement while the step is queued', () => {
  const step = verifyStep(read);

  expect(step?.status).toBe('current');
  expect(step?.detail).toBe('3 of 3 citations checked, 2 waiting for judgement');
  expect(step?.detail).not.toContain('later version');
});

it('RF-1014 RF-301 the stepper counts the verdicts and marks Verify done once the step ends', () => {
  expect(verifyStep(judgement.slice(0, 9))?.detail).toBe(
    '3 of 3 citations checked, 1 judged, 1 waiting for judgement',
  );

  const step = verifyStep(judgement);

  expect(step?.status).toBe('done');
  expect(step?.detail).toBe('3 of 3 citations checked, 2 judged');
});

it('RF-1014 a run that ended before the judgement says which claims were not judged, never waiting', () => {
  const ended = row('Ended');
  const step = verifyStep([...read, runEnded(8, 'Interrupted')], ended);

  expect(step?.detail).toBe('3 of 3 citations checked, 2 not judged');
  expect(step?.detail).not.toContain('waiting');
});

it('RF-1014 the journey explains the judgement while it waits and drops the later-version note', () => {
  const waiting = checkStep(read);

  expect(waiting?.detail).toBe('3 of 3 citations checked, 2 waiting for judgement');
  expect(waiting?.note).toBe(
    'Each claim that passes is then judged by a second model against its cited lines.',
  );
  expect(waiting?.status).toBe('current');
  const done = checkStep(judgement);
  expect(done?.detail).toBe('3 of 3 citations checked, 2 judged');
  expect(done?.note).toBeUndefined();
  expect(done?.status).toBe('done');
});

it('RF-1014 the judgement step events become lines of the log', () => {
  const state = stateAfter(...judgement);

  const lines = state.log.filter((line) => line.type.startsWith('verify.judgement'));

  expect(lines.map((line) => line.text)).toEqual([
    '2 claims to judge',
    '1 supported, 1 rejected, 0 unverified, 0 not judged',
  ]);
});
