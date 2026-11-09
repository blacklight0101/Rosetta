import { describe, expect, it } from 'vitest';
import type { RunPhase } from '../../../web/src/lib/live-run/run-phase.js';
import { runTitleOf } from '../../../web/src/lib/live-run/run-title.js';
import {
  deepenRoundStarted,
  deepenStarted,
  ev,
  startedData,
  stateAfter,
} from './live-run-fixtures.js';

// RF-1015 (P8-27, UX-11): the title of a run page names the kind of run and its state, never "Live run".

const done: RunPhase = { kind: 'ended', endState: 'Completed' };
const empty = stateAfter(ev(1, 'run.started', startedData));

describe('runTitleOf', () => {
  it('RF-1015 names a scan that ended, "Scan, done"', () => {
    expect(runTitleOf({ stage: 'scan', phase: done, state: empty })).toBe('Scan, done');
  });

  it('RF-1015 names an understand run that works, "Understand, running"', () => {
    expect(runTitleOf({ stage: 'understand', phase: { kind: 'running' }, state: empty })).toBe(
      'Understand, running',
    );
  });

  it('RF-1015 names a Deepen by its round, "Deepen round 2, done"', () => {
    const state = stateAfter(
      ev(1, 'run.started', startedData),
      deepenStarted(2),
      deepenRoundStarted(3, 1),
      deepenRoundStarted(4, 2),
    );

    expect(runTitleOf({ stage: 'understand', phase: done, state })).toBe('Deepen round 2, done');
  });

  it('RF-1015 names a plan run and a run that waits', () => {
    expect(runTitleOf({ stage: 'plan', phase: done, state: empty })).toBe('Plan, done');
    expect(runTitleOf({ stage: 'scan', phase: { kind: 'queued' }, state: empty })).toBe(
      'Scan, waiting in the queue',
    );
  });

  it.each([
    ['CapReached', 'Understand, stopped at its cap'],
    ['Failed', 'Understand, failed'],
    ['Interrupted', 'Understand, stopped by you'],
  ])('RF-1015 says how a run that ended %s ended', (endState, title) => {
    const phase: RunPhase = { kind: 'ended', endState };

    expect(runTitleOf({ stage: 'understand', phase, state: empty })).toBe(title);
  });
});
