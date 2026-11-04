import { describe, expect, it } from 'vitest';
import { endRun, startRun } from '../../../../src/domain/runs/run.js';
import { RUN_END_STATES } from '../../../../src/domain/runs/run-states.js';
import { runningRun, sampleRun } from '../../../support/run-fixtures.js';

// RF-003, RNF-002, RF-1108, architecture section 5 (`Run`, `RunQueueState`): a run is queued,
// then running, then ended with an end state that is set exactly once.

describe('startRun', () => {
  it('RF-1108 moves a queued run to running and records when it started', () => {
    const queued = sampleRun();

    const started = startRun(queued, 5_000);

    expect(started).toEqual({
      ok: true,
      value: { ...queued, queueState: 'Running', startedAt: 5_000, spanStartedAt: 5_000 },
    });
  });

  it.each(['Running', 'Ended'] as const)('RF-1108 refuses to start a run that is %s', (state) => {
    const run = sampleRun({
      queueState: state,
      endState: state === 'Ended' ? 'Completed' : null,
      endedAt: state === 'Ended' ? 7 : null,
    });

    expect(startRun(run, 5_000)).toEqual({ ok: false, error: 'not-queued' });
  });
});

describe('endRun and the last sign of life', () => {
  it('P8-122 counts the open span only up to the instant the run was last alive', () => {
    const running = runningRun({ startedAt: 5_000, spanStartedAt: 5_000, activeMs: 1_000 });

    const ended = endRun(running, 'Interrupted', 9_000, { activeUntil: 6_500 });

    expect(ended).toMatchObject({
      ok: true,
      value: { endedAt: 9_000, spanStartedAt: null, activeMs: 2_500 },
    });
  });

  it('P8-122 never counts a negative span when the last sign of life is before the span began', () => {
    const running = runningRun({ startedAt: 5_000, spanStartedAt: 5_000, activeMs: 1_000 });

    const ended = endRun(running, 'Interrupted', 9_000, { activeUntil: 4_000 });

    expect(ended).toMatchObject({ ok: true, value: { activeMs: 1_000 } });
  });
});

describe('endRun', () => {
  it.each(RUN_END_STATES)('RF-003 ends a running run as %s with the time it ended', (endState) => {
    const running = runningRun({ startedAt: 5_000, spanStartedAt: 5_000 });

    const ended = endRun(running, endState, 9_000);

    expect(ended).toEqual({
      ok: true,
      value: {
        ...running,
        ...{ queueState: 'Ended', endState, endedAt: 9_000 },
        ...{ spanStartedAt: null, activeMs: 4_000 },
      },
    });
  });

  it('RF-003 sets the end state exactly once', () => {
    const first = endRun(runningRun(), 'Completed', 9_000);
    if (!first.ok) throw new Error('The run did not end');

    expect(endRun(first.value, 'Failed', 9_500)).toEqual({ ok: false, error: 'already-ended' });
  });

  it('RF-1108 cancels a queued run as Interrupted, without a start time', () => {
    const queued = sampleRun();

    expect(endRun(queued, 'Interrupted', 9_000)).toEqual({
      ok: true,
      value: { ...queued, queueState: 'Ended', endState: 'Interrupted', endedAt: 9_000 },
    });
  });

  it.each(['Completed', 'CapReached', 'Failed'] as const)(
    'RF-1108 refuses to end a queued run as %s: it never ran',
    (endState) => {
      expect(endRun(sampleRun(), endState, 9_000)).toEqual({
        ok: false,
        error: 'queued-run-can-only-be-interrupted',
      });
    },
  );
});
